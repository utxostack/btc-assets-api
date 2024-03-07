import { Cell } from '@ckb-lumos/lumos';
import { Cradle } from '../container';
import { DelayedError, Job, Queue, Worker } from 'bullmq';
import { AxiosError } from 'axios';

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
  private cradle: Cradle;
  private queue: Queue<ITransactionRequest>;
  private worker: Worker<ITransactionRequest>;

  constructor(cradle: Cradle) {
    this.cradle = cradle;
    this.queue = new Queue(TRANSACTION_QUEUE_NAME, {
      connection: cradle.redis,
    });
    this.worker = new Worker(TRANSACTION_QUEUE_NAME, this.process.bind(this), {
      connection: cradle.redis,
      autorun: false,
      concurrency: 10,
      // TODO: for development only
      removeOnComplete: { count: 0 },
      removeOnFail: { count: 0 },
    });
  }

  private async process(job: Job<ITransactionRequest>, token?: string) {
    const { txid } = job.data;
    try {
      const btcTx = await this.cradle.electrs.getTransaction(txid);
      // TODO: verify transaction and commitment

      const btcInfo = await this.cradle.bitcoind.getBlockchainInfo();
      const blockHeight = btcTx.status.block_height ?? btcInfo.blocks;
      // TODO: use different confirmation threshold for L1 and L2 transactions
      const isConfirmed = btcInfo.blocks - blockHeight >= 1;
      if (!isConfirmed) {
        // delay job if transaction not confirmed yet
        await this.moveJobToDelayed(job, token);
        return;
      }

      console.log('Processing job', job.id);
      // TODO: generate RGB_lock witness
      // TODO: add paymaster cell into inputs if necessary
      // TODO: sign CKB transaction and broadcast
      // TODO: wait for CKB transaction to be confirmed
    } catch (err) {
      if (err instanceof AxiosError) {
        // delay job if transaction not broadcasted yet
        if (err.response?.status === 404) {
          await this.moveJobToDelayed(job, token);
          return;
        }
      }
      throw err;
    }
  }

  private async moveJobToDelayed(job: Job<ITransactionRequest>, token?: string) {
    this.cradle.logger.info(`[TransactionManager] Moving job ${job.id} to delayed queue`);
    // FIXME: choose a better delay time
    await job.moveToDelayed(Date.now() + 1000 * 60, token);
    // https://docs.bullmq.io/patterns/process-step-jobs#delaying
    throw new DelayedError();
  }

  public async enqueueTransaction(request: ITransactionRequest): Promise<void> {
    await this.queue.add(request.txid, request, { jobId: request.txid, delay: 2000 });
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
