import { Cradle } from '../container';
import { Queue, Worker } from 'bullmq';

interface Cell {}

interface IPaymaster {
  enqueueCell(cell: Cell): Promise<void>;
  verifyTransaction(txid: string): Promise<boolean>;
}

class CellQueue {
  private queueName = 'paymaster-cell-queue';
  private queue: Queue<Cell>;
  private worker: Worker<Cell>;

  constructor({ redis }: Cradle) {
    const opts = { connection: redis };
    this.queue = new Queue(this.queueName, opts);
    this.worker = new Worker(this.queueName, undefined, opts);
  }

  async add(cell: Cell) {
    await this.queue.add(this.queueName, cell);
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

  async enqueueCell(cell: Cell) {
    await this.cellQueue.add(cell);
  }

  async verifyTransaction(txid: string) {
    console.log(`Verifying transaction: ${txid}`);
    // TODO: Implement transaction verification
    return true;
  }
}
