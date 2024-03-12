import { Cell } from '@ckb-lumos/lumos';
import { Cradle } from '../container';
import { Job, Queue, Worker } from 'bullmq';

interface IPaymaster {
  enqueueCell(cell: Cell): Promise<void>;
  getNextCellJob(token: string): Promise<Job<Cell>>;
  refillCellQueue(): Promise<void>;
}

const PAYMASTER_CELL_QUEUE_NAME = 'rgbpp-ckb-paymaster-cell-queue';

class CellQueue {
  private queue: Queue<Cell>;
  private worker: Worker<Cell>;

  constructor({ redis }: Cradle) {
    this.queue = new Queue(PAYMASTER_CELL_QUEUE_NAME, {
      connection: redis,
    });
    this.worker = new Worker(PAYMASTER_CELL_QUEUE_NAME, undefined, {
      connection: redis,
      removeOnComplete: { count: 0 },
    });
  }

  public async add(cell: Cell) {
    await this.queue.add(PAYMASTER_CELL_QUEUE_NAME, cell);
  }

  public async getNext(token: string) {
    const job = await this.worker.getNextJob(token);
    return job;
  }
}

export default class Paymaster implements IPaymaster {
  private cellQueue: CellQueue;

  constructor(cradle: Cradle) {
    this.cellQueue = new CellQueue(cradle);
    this.refillCellQueue();
  }

  public async enqueueCell(cell: Cell) {
    await this.cellQueue.add(cell);
  }

  public async getNextCellJob(token: string) {
    return this.cellQueue.getNext(token);
  }

  public async refillCellQueue() {}
}
