import { Cradle } from '../container';
import { DelayedError, Job, Queue, Worker } from 'bullmq';
import { AxiosError } from 'axios';
import { CKBRawTransaction, CKBVirtualResult } from '../routes/rgbpp/types';
import { Transaction } from '../routes/bitcoin/types';
import { opReturnScriptPubKeyToData } from '@rgbpp-sdk/btc';
// FIXME: import calculateCommitment from @rgbpp-sdk/ckb
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-expect-error
import { calculateCommitment, appendCkbTxWitnesses, sendCkbTx, Collector } from '@rgbpp-sdk/ckb';

export interface ITransactionRequest {
  txid: string;
  ckbVirtualResult: CKBVirtualResult;
}

export interface IProcessCallbacks {
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

export const TRANSACTION_QUEUE_NAME = 'rgbpp-ckb-transaction-queue';

/**
 * TransactionManager
 * responsible for processing RGB++ CKB transactions, including:
 * - enqueueing transaction requests to the queue
 * - verifying transaction requests, including checking the commitment
 * - processing transaction when it's confirmed on L1(Bitcoin)
 * - generate RGB_lock witness into the CKB transaction
 * - add paymaster cell and sign the CKB transaction if needed
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

  private waitForTranscationConfirmed(txHash: string) {
    // eslint-disable-next-line no-async-promise-executor
    return new Promise(async (resolve) => {
      const transaction = await this.cradle.ckbRpc.getTransaction(txHash);
      const { status } = transaction.txStatus;
      if (status === 'committed') {
        resolve(txHash);
      } else {
        setTimeout(() => {
          resolve(this.waitForTranscationConfirmed(txHash));
        }, 1000);
      }
    });
  }

  public async process(job: Job<ITransactionRequest>, token?: string) {
    // TODO: add job stages and error handling
    try {
      const isVerified = await this.verifyTransaction(job.data);
      if (!isVerified) {
        throw new Error('Transaction not verified');
      }
      const { ckbVirtualResult } = job.data;
      let signedTx = appendCkbTxWitnesses(ckbVirtualResult)!;

      // append paymaster cell and sign the transaction if needed
      if (ckbVirtualResult.needPaymasterCell) {
        const tx = await this.cradle.paymaster.appendCellAndSignTx({
          ...ckbVirtualResult,
          ckbRawTx: signedTx!,
        });
        signedTx = tx as CKBRawTransaction;
      }

      const txHash = await sendCkbTx({
        collector: new Collector({
          ckbNodeUrl: this.cradle.env.CKB_RPC_URL,
          ckbIndexerUrl: this.cradle.env.CKB_INDEXER_URL,
        }),
        signedTx,
      });
      job.returnvalue = txHash;

      await this.waitForTranscationConfirmed(txHash);
    } catch (err) {
      // move the job to delayed queue if the transaction data not found or not confirmed
      const transactionDataNotFound = err instanceof AxiosError && err.response?.status === 404;
      const transactionNotConfirmed = err instanceof DelayedError;
      if (transactionDataNotFound || transactionNotConfirmed) {
        await this.moveJobToDelayed(job, token);
        return;
      }
      throw err;
    }
  }

  public async enqueueTransaction(request: ITransactionRequest): Promise<void> {
    await this.queue.add(request.txid, request, {
      jobId: request.txid,
      delay: this.cradle.env.TRANSACTION_QUEUE_JOB_DELAY,
    });
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
