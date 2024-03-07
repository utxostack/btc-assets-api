import { Cell } from '@ckb-lumos/lumos';
import { Cradle } from '../container';
import { Queue, Worker } from 'bullmq';

interface IPaymaster {
  enqueueUnspentCell(cell: Cell): Promise<void>;
  verifyTransaction(txid: string): Promise<boolean>;
}

const PAYMASTER_CELL_QUEUE_NAME = 'rgbpp-ckb-paymaster-cell-queue';

class CellQueue {
  private queue: Queue<Cell>;
  private worker: Worker<Cell>;

  constructor({ redis }: Cradle) {
    const opts = { connection: redis };
    this.queue = new Queue(PAYMASTER_CELL_QUEUE_NAME, opts);
    this.worker = new Worker(PAYMASTER_CELL_QUEUE_NAME, undefined, opts);
  }

  async add(cell: Cell) {
    await this.queue.add(PAYMASTER_CELL_QUEUE_NAME, cell);
  }

  async getNext(token: string) {
    const job = await this.worker.getNextJob(token);
    return job;
  }
}

export default class Paymaster implements IPaymaster {
  private cellQueue: CellQueue;

  constructor(cradle: Cradle) {
    this.cellQueue = new CellQueue(cradle);
  }

  async enqueueUnspentCell(cell: Cell) {
    await this.cellQueue.add(cell);
  }

  async verifyTransaction(txid: string) {
    console.log(`Verifying transaction: ${txid}`);
    // TODO: Implement transaction verification
    return true;
  }
}
