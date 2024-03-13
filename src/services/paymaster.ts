import { Cell } from '@ckb-lumos/lumos';
import { Cradle } from '../container';
import { Job, Queue, Worker } from 'bullmq';
import { CKBVirtualResult } from '../routes/rgbpp/types';
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-expect-error
import { appendPaymasterCellAndSignCkbTx } from '@rgbpp-sdk/ckb';
import { randomUUID } from 'crypto';
import { hd, config } from '@ckb-lumos/lumos';

interface IPaymaster {
  enqueueCell(cell: Cell): Promise<void>;
  getNextCellJob(token: string): Promise<Job<Cell>>;
  refillCellQueue(): Promise<number>;
  appendCellAndSignTx(ckbVirtualResult: CKBVirtualResult): Promise<string>;
}

const PAYMASTER_CELL_QUEUE_NAME = 'rgbpp-ckb-paymaster-cell-queue';

export default class Paymaster implements IPaymaster {
  private cradle: Cradle;
  private queue: Queue<Cell>;
  private worker: Worker<Cell>;

  private cellCapacity: number;
  private presetCount: number;
  private refilling = false;

  constructor(cradle: Cradle) {
    this.cradle = cradle;
    this.queue = new Queue(PAYMASTER_CELL_QUEUE_NAME, {
      connection: cradle.redis,
    });
    this.worker = new Worker(PAYMASTER_CELL_QUEUE_NAME, undefined, {
      connection: cradle.redis,
      removeOnComplete: { count: 0 },
    });
    this.cellCapacity = this.cradle.env.PAYMASTER_CELL_CAPACITY;
    this.presetCount = this.cradle.env.PAYMASTER_CELL_PRESET_COUNT;
  }

  private get privateKey() {
    return this.cradle.env.PAYMASTER_PRIVATE_KEY;
  }

  private get lockScript() {
    const args = hd.key.privateKeyToBlake160(this.privateKey);
    const scripts =
      this.cradle.env.NETWORK === 'mainnet' ? config.predefined.AGGRON4.SCRIPTS : config.predefined.LINA.SCRIPTS;
    const template = scripts['SECP256K1_BLAKE160']!;
    const lockScript = {
      codeHash: template.CODE_HASH,
      hashType: template.HASH_TYPE,
      args: args,
    };
    return lockScript;
  }

  public async enqueueCell(cell: Cell) {
    await this.queue.add(PAYMASTER_CELL_QUEUE_NAME, cell);
  }

  public async getNextCellJob(token: string) {
    if (!this.refilling) {
      const count = await this.queue.count();
      if (count < this.presetCount * 0.3) {
        this.refilling = true;
        const filled = await this.refillCellQueue();
        if (filled === 0) {
          // TODO: throw a custom error and capture error to sentry
          // maybe we need to sent a notification email to the admin
        }
        this.refilling = false;
      }
    }
    const job = await this.worker.getNextJob(token);
    return job;
  }

  public async refillCellQueue() {
    this.cradle.logger.info('[Paymaster] Refilling paymaster cell queue...');
    const capacity = this.cellCapacity.toString(16);
    const collector = this.cradle.ckbIndexer.collector({
      lock: this.lockScript,
      outputCapacityRange: [capacity, capacity],
    });
    const cells = collector.collect();
    const queueSize = await this.queue.count();

    let filled = 0;
    for await (const cell of cells) {
      await this.enqueueCell(cell);
      filled += 1;
      if (queueSize + filled >= this.presetCount) {
        break;
      }
    }
    this.cradle.logger.info(`[Paymaster] Refilled ${filled} paymaster cells`);
    return filled;
  }

  public async appendCellAndSignTx(ckbVirtualResult: CKBVirtualResult) {
    const { ckbRawTx, sumInputsCapacity } = ckbVirtualResult;
    const token = randomUUID();
    const cellJob = await this.getNextCellJob(token);
    if (!cellJob) {
      // FIXME: throw a custom error and capture error to sentry
      throw new Error('Paymaster cell not found');
    }
    const paymasterCell = cellJob.data;
    const signedTx = await appendPaymasterCellAndSignCkbTx(
      this.privateKey,
      ckbRawTx,
      sumInputsCapacity,
      paymasterCell,
      this.cradle.env.NETWORK === 'mainnet',
    );
    return signedTx;
  }
}
