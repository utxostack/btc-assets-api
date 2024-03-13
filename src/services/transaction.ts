import { Cradle } from '../container';
import { DelayedError, Job, Queue, Worker } from 'bullmq';
import { AxiosError } from 'axios';
import { CKBVirtualResult } from '../routes/rgbpp/types';
import { Transaction } from '../routes/bitcoin/types';
import { opReturnScriptPubKeyToData } from '@rgbpp-sdk/btc';
// FIXME: import calculateCommitment from @rgbpp-sdk/ckb
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-expect-error
import { calculateCommitment } from '@rgbpp-sdk/ckb';

interface ITransactionRequest {
  txid: string;
  ckbVirtualResult: CKBVirtualResult;
}

interface IProcessCallbacks {
  onCompleted?: (job: Job<ITransactionRequest>) => void;
  onFailed?: (job: Job<ITransactionRequest> | undefined, err: Error) => void;
}

interface ITransactionManager {
  enqueueTransaction(request: ITransactionRequest): Promise<void>;
  getTransactionRequest(txid: string): Promise<Job<ITransactionRequest> | undefined>;
  startProcess(callbacks?: IProcessCallbacks): Promise<void>;
  pauseProcess(): Promise<void>;
  closeProcess(): Promise<void>;
}

const TRANSACTION_QUEUE_NAME = 'rgbpp-ckb-transaction-queue';

/**
 * TransactionManager
 * responsible for processing RGB++ CKB transactions, including:
 * - verifying transaction requests, including checking the commitment
 * - enqueueing transaction requests to the queue
 * - processing transaction when it's confirmed on L1(Bitcoin)
 * - sending CKB transaction to the network and waiting for confirmation
 */
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
    });
  }

  /**
   * Get commitment from Bitcoin transactions
   * depended on @rgbpp-sdk/btc opReturnScriptPubKeyToData method
   */
  private async getCommitmentFromBtcTx(tx: Transaction): Promise<Buffer> {
    const opReturn = tx.vout.find((vout) => vout.scriptpubkey_type === 'op_return');
    if (!opReturn) {
      throw new Error('No OP_RETURN output found');
    }
    const buffer = Buffer.from(opReturn.scriptpubkey, 'hex');
    return opReturnScriptPubKeyToData(buffer);
  }

  /**
   * Verify transaction request
   * - check if the commitment matches the Bitcoin transaction
   * - check if the CKB Virtual Transaction is valid
   * - check if the Bitcoin transaction is confirmed
   */
  public async verifyTransaction(request: ITransactionRequest): Promise<boolean> {
    const { txid, ckbVirtualResult } = request;
    const btcTx = await this.cradle.electrs.getTransaction(txid);

    const { commitment, ckbRawTx } = ckbVirtualResult;
    const btcTxCommitment = await this.getCommitmentFromBtcTx(btcTx);
    if (commitment !== btcTxCommitment.toString('hex')) {
      return false;
    }
    if (commitment !== calculateCommitment(ckbRawTx)) {
      return false;
    }

    const btcInfo = await this.cradle.bitcoind.getBlockchainInfo();
    const blockHeight = btcTx.status.block_height ?? btcInfo.blocks;
    // TODO: use different confirmation threshold for L1 and L2 transactions
    const isConfirmed = btcInfo.blocks - blockHeight >= 1;
    if (!isConfirmed) {
      throw new DelayedError();
    }
    return true;
  }

  /**
   * Move job to delayed Queue
   */
  private async moveJobToDelayed(job: Job<ITransactionRequest>, token?: string) {
    this.cradle.logger.info(`[TransactionManager] Moving job ${job.id} to delayed queue`);
    // FIXME: choose a better delay time
    await job.moveToDelayed(Date.now() + 1000 * 60, token);
    // https://docs.bullmq.io/patterns/process-step-jobs#delaying
    throw new DelayedError();
  }

  public async process(job: Job<ITransactionRequest>, token?: string) {
    try {
      const isVerified = await this.verifyTransaction(job.data);
      if (!isVerified) {
        throw new Error('Transaction not verified');
      }

      // TODO: generate RGB_lock witness
      // TODO: add paymaster cell into inputs if necessary
      // TODO: sign CKB transaction and broadcast
      // TODO: wait for CKB transaction to be confirmed

      // FIXME: return a fake tx hash, job.returnvalue repensents the ckb tx hash
      // so we can use btc txid to get ckb tx hash, then query ckb tx with it
      return '0x96090236087edd4b0acc847ec62e2e2e88788d48affb97aab0d1e27453776d5b';
    } catch (err) {
      if (err instanceof AxiosError) {
        // delay job if transaction not broadcasted yet
        if (err.response?.status === 404) {
          await this.moveJobToDelayed(job, token);
          return;
        }
      }
      // delay job if transaction not confirmed yet
      if (err instanceof DelayedError) {
        await this.moveJobToDelayed(job, token);
        return;
      }
      throw err;
    }
  }

  public async enqueueTransaction(request: ITransactionRequest): Promise<void> {
    await this.queue.add(request.txid, request, { jobId: request.txid, delay: 2000 });
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

  public async closeProcess(): Promise<void> {
    await this.worker.close();
    await this.queue.close();
  }
}
