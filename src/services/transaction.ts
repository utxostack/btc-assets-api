import { Cell } from '@ckb-lumos/lumos';
import { Cradle } from '../container';
import { Job, Queue, Worker } from 'bullmq';

interface ITransactionRequest {
  txid: string;
  transaction: {
    inputs: Cell[];
    outputs: Cell[];
  };
}

interface IProcessCallbacks {
  onCompleted?: (job: Job<ITransactionRequest>) => void;
  onFailed?: (job: Job<ITransactionRequest> | undefined, err: Error) => void;
}

interface ITransactionManager {
  enqueueTransaction(request: ITransactionRequest): Promise<void>;
  verifyTransactionRequest(request: ITransactionRequest): Promise<boolean>;
  getTransactionRequest(txid: string): Promise<Job<ITransactionRequest> | undefined>;
  startProcess(callbacks?: IProcessCallbacks): Promise<void>;
  pauseProcess(): Promise<void>;
  dispose(): Promise<void>;
}

const TRANSACTION_QUEUE_NAME = 'rgbpp-ckb-transaction-queue';

export default class TransactionManager implements ITransactionManager {
  private queue: Queue<ITransactionRequest>;
  private worker: Worker<ITransactionRequest>;

  constructor({ redis }: Cradle) {
    this.queue = new Queue(TRANSACTION_QUEUE_NAME, {
      connection: redis,
    });
    this.worker = new Worker(TRANSACTION_QUEUE_NAME, this.process.bind(this), {
      connection: redis,
      autorun: false,
      concurrency: 10,
    });
  }

  private async process(job: Job<ITransactionRequest>) {
    console.log('Processing job', job.id);
    console.log('Job data', job.data);
  }

  public async enqueueTransaction(request: ITransactionRequest): Promise<void> {
    await this.queue.add(request.txid, request, { jobId: request.txid });
  }

  public async verifyTransactionRequest(request: ITransactionRequest): Promise<boolean> {
    console.log('Verifying transaction request', request);
    return true;
  }

  public async getTransactionRequest(txid: string): Promise<Job<ITransactionRequest> | undefined> {
    const job = await this.queue.getJob(txid);
    return job;
  }

  public async startProcess(callbacks?: IProcessCallbacks): Promise<void> {
    if (callbacks?.onCompleted) {
      this.worker.on('completed', callbacks.onCompleted);
    }
    if (callbacks?.onFailed) {
      this.worker.on('failed', callbacks.onFailed);
    }
    await this.worker.run();
  }

  public async pauseProcess(): Promise<void> {
    await this.worker.pause();
  }

  public async dispose(): Promise<void> {
    await this.worker.close();
    await this.queue.close();
  }
}
