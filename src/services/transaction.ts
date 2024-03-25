import { Cradle } from '../container';
import { DelayedError, Job, Queue, Worker } from 'bullmq';
import { AxiosError } from 'axios';
import { CKBRawTransaction, CKBVirtualResult } from '../routes/rgbpp/types';
import { BTC_TX_ID_PLACEHOLDER, opReturnScriptPubKeyToData, transactionToHex } from '@rgbpp-sdk/btc';
import {
  appendCkbTxWitnesses,
  SPVService,
  sendCkbTx,
  Collector,
  append0x,
  RGBPPLock,
  updateCkbTxWithRealBtcTxId,
  SpvRpcError,
} from '@rgbpp-sdk/ckb';
import { buildRgbppLockArgs, calculateCommitment, genRgbppLockScript } from '@rgbpp-sdk/ckb/lib/utils/rgbpp';
import * as Sentry from '@sentry/node';
import { Transaction } from '../routes/bitcoin/types';
import { bytes } from '@ckb-lumos/codec';
import { Transaction as BitcoinTransaction } from 'bitcoinjs-lib';

export interface ITransactionRequest {
  txid: string;
  ckbVirtualResult: CKBVirtualResult;
}

export interface IProcessCallbacks {
  onActive?: (job: Job<ITransactionRequest>) => void;
  onCompleted?: (job: Job<ITransactionRequest>) => void;
  onFailed?: (job: Job<ITransactionRequest> | undefined, err: Error) => void;
}

interface ITransactionManager {
  enqueueTransaction(request: ITransactionRequest): Promise<Job<ITransactionRequest>>;
  getTransactionRequest(txid: string): Promise<Job<ITransactionRequest> | undefined>;
  startProcess(callbacks?: IProcessCallbacks): Promise<void>;
  pauseProcess(): Promise<void>;
  closeProcess(): Promise<void>;
}

export const TRANSACTION_QUEUE_NAME = 'rgbpp-ckb-transaction-queue';

class InvalidTransactionError extends Error {
  public data: ITransactionRequest;

  constructor(data: ITransactionRequest) {
    super('Invalid transaction');
    this.name = 'InvalidTransactionError';
    this.data = data;
  }
}

class OpReturnNotFoundError extends Error {
  constructor(txid: string) {
    super(`OP_RETURN output not found: ${txid}`);
    this.name = 'OpReturnNotFoundError';
  }
}

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
  private spvService: SPVService;

  constructor(cradle: Cradle) {
    this.cradle = cradle;
    this.queue = new Queue(TRANSACTION_QUEUE_NAME, {
      connection: cradle.redis,
      // retry failed jobs with a delay of 60 seconds, up to 3 time
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: 'fixed',
          delay: cradle.env.TRANSACTION_QUEUE_JOB_DELAY,
        },
      },
    });
    this.worker = new Worker(TRANSACTION_QUEUE_NAME, this.process.bind(this), {
      connection: cradle.redis,
      autorun: false,
      concurrency: 10,
    });
    this.spvService = new SPVService(cradle.env.TRANSACTION_SPV_SERVICE_URL);
    // FIXME: remove this line after testing
    this.queue.getJob('bbb51bf1ac43fcb033ae64a3aeb4c0fb4af9f743ecf9173ec55fb2f9f499a31f').then((job) => {
      job?.retry();
    });
  }

  private get isMainnet() {
    return this.cradle.env.NETWORK === 'mainnet';
  }

  private get rgbppLockScript() {
    return genRgbppLockScript('0x', this.isMainnet);
  }

  /**
   * Get commitment from Bitcoin transactions
   * depended on @rgbpp-sdk/btc opReturnScriptPubKeyToData method
   * @param tx - Bitcoin transaction
   */
  private async getCommitmentFromBtcTx(tx: Transaction): Promise<Buffer> {
    const opReturn = tx.vout.find((vout) => vout.scriptpubkey_type === 'op_return');
    if (!opReturn) {
      throw new OpReturnNotFoundError(tx.txid);
    }
    const buffer = Buffer.from(opReturn.scriptpubkey, 'hex');
    return opReturnScriptPubKeyToData(buffer);
  }

  /**
   * Clear the btcTxId in the RGBPP lock script to avoid the mismatch between the CKB and BTC transactions
   * to avoid the mismatch between the CKB and BTC transactions
   * @param ckbRawTx - CKB Raw Transaction
   * @param txid - Bitcoin transaction id
   */
  private async clearBtcTxIdInRgbppLockScript(ckbRawTx: CKBRawTransaction, txid: string) {
    const outputs = ckbRawTx.outputs.map((output) => {
      const { lock } = output;
      if (lock.codeHash !== this.rgbppLockScript.codeHash || lock.hashType !== this.rgbppLockScript.hashType) {
        return output;
      }
      const unpack = RGBPPLock.unpack(lock.args);
      // https://github.com/ckb-cell/rgbpp-sdk/tree/main/examples/rgbpp#what-you-must-know-about-btc-transaction-id
      const btcTxid = bytes.hexify(bytes.bytify(unpack.btcTxid).reverse());
      if (btcTxid !== append0x(txid)) {
        return output;
      }
      return {
        ...output,
        lock: {
          ...lock,
          args: buildRgbppLockArgs(unpack.outIndex, BTC_TX_ID_PLACEHOLDER),
        },
      };
    });
    return {
      ...ckbRawTx,
      outputs,
    };
  }

  /**
   * Verify transaction request
   * - check if the commitment matches the Bitcoin transaction
   * - check if the CKB Virtual Transaction is valid
   * - check if the Bitcoin transaction is confirmed
   * @param request - transaction request, including txid and ckbVirtualResult
   * @param btcTx - Bitcoin transaction
   */
  public async verifyTransaction(request: ITransactionRequest, btcTx: Transaction): Promise<boolean> {
    const { txid, ckbVirtualResult } = request;
    const { commitment, ckbRawTx } = ckbVirtualResult;

    // make sure the commitment matches the Bitcoin transaction
    const btcTxCommitment = await this.getCommitmentFromBtcTx(btcTx);
    if (commitment !== btcTxCommitment.toString('hex')) {
      this.cradle.logger.info(`[TransactionManager] Bitcoin Transaction Commitment Mismatch`);
      return false;
    }

    // make sure the CKB Virtual Transaction is valid
    const ckbRawTxWithoutBtcTxId = await this.clearBtcTxIdInRgbppLockScript(ckbRawTx, txid);
    if (commitment !== calculateCommitment(ckbRawTxWithoutBtcTxId)) {
      this.cradle.logger.info(`[TransactionManager] Invalid CKB Virtual Transaction`);
      return false;
    }

    // make sure the Bitcoin transaction is confirmed
    if (!btcTx.status.confirmed) {
      // https://docs.bullmq.io/patterns/process-step-jobs#delaying
      this.cradle.logger.info(`[TransactionManager] Bitcoin Transaction Not Confirmed`);
      throw new DelayedError();
    }
    return true;
  }

  /**
   * Move job to delayed
   * @param job - the job to move
   * @param token - the token to move the job
   */
  private async moveJobToDelayed(job: Job<ITransactionRequest>, token?: string) {
    this.cradle.logger.info(`[TransactionManager] Moving job ${job.id} to delayed queue`);
    const timestamp = Date.now() + this.cradle.env.TRANSACTION_QUEUE_JOB_DELAY;
    await job.moveToDelayed(timestamp, token);
    // https://docs.bullmq.io/patterns/process-step-jobs#delaying
    throw new DelayedError();
  }

  /**
   * Wait for the ckb transaction to be confirmed
   * @param txHash - the ckb transaction hash
   */
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

  /**
   * Get the CKB Raw Transaction with the real BTC transaction id
   * @param ckbVirtualResult - the CKB Virtual Transaction
   * @param txid - the real BTC transaction id
   */
  private getCkbRawTxWithRealBtcTxid(ckbVirtualResult: CKBVirtualResult, txid: string) {
    let ckbRawTx = ckbVirtualResult.ckbRawTx;
    // if at least one output's lock script contains the RGBPP lock script and btcTxid is BTC_TX_ID_PLACEHOLDER,
    // then ckbRawTx needs to be updated
    const needUpdateCkbTx = ckbRawTx.outputs.some((output) => {
      const { codeHash, hashType, args } = output.lock;
      const { btcTxid } = RGBPPLock.unpack(args);
      return (
        codeHash === this.rgbppLockScript.codeHash &&
        hashType === this.rgbppLockScript.hashType &&
        btcTxid === BTC_TX_ID_PLACEHOLDER
      );
    });
    if (needUpdateCkbTx) {
      ckbRawTx = updateCkbTxWithRealBtcTxId({ ckbRawTx, btcTxId: txid, isMainnet: this.isMainnet });
    }
    return ckbRawTx;
  }

  /**
   * Process the transaction request, called by the worker
   * - get the Bitcoin transaction
   * - verify the transaction request
   * - append the RGBPP lock witness to the CKB transaction
   * - append the paymaster cell and sign the transaction if needed
   * - send the CKB transaction to the network and wait for the transaction to be confirmed
   * - mark the paymaster cell as spent to avoid double spending
   * @param job - the job to process
   * @param token - the token to get the next job
   */
  public async process(job: Job<ITransactionRequest>, token?: string) {
    try {
      const { ckbVirtualResult, txid } = job.data;
      const btcTx = await this.cradle.electrs.getTransaction(txid);
      const isVerified = await this.verifyTransaction({ ckbVirtualResult, txid }, btcTx);
      if (!isVerified) {
        throw new InvalidTransactionError(job.data);
      }

      const ckbRawTx = this.getCkbRawTxWithRealBtcTxid(ckbVirtualResult, txid);
      // bitcoin JSON-RPC gettransaction is wallet only
      // we need to use electrs to get the transaction hex and index in block
      const [hex, btcTxIndexInBlock] = await Promise.all([
        this.cradle.electrs.getTransactionHex(txid),
        this.cradle.electrs.getBlockTxIdsByHash(btcTx.status.block_hash!).then((txids) => txids.indexOf(txid)),
      ]);
      // using for spv proof, we need to remove the witness data from the transaction
      const hexWithoutWitness = transactionToHex(BitcoinTransaction.fromHex(hex), false);
      let signedTx = await appendCkbTxWitnesses({
        ...ckbVirtualResult,
        ckbRawTx,
        spvService: this.spvService,
        btcTxId: txid,
        btcTxBytes: hexWithoutWitness,
        btcTxIndexInBlock,
      })!;

      // append paymaster cell and sign the transaction if needed
      if (ckbVirtualResult.needPaymasterCell) {
        const tx = await this.cradle.paymaster.appendCellAndSignTx(txid, {
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
      // mark the paymaster cell as spent to avoid double spending
      // if (ckbVirtualResult.needPaymasterCell) {
      //   await this.cradle.paymaster.makePaymasterCellAsSpent(txid, signedTx!);
      // }
      return txHash;
    } catch (err) {
      this.cradle.logger.debug(err);
      // move the job to delayed queue if the transaction data not found or not confirmed or spv proof not found yet
      const transactionDataNotFound = err instanceof AxiosError && err.response?.status === 404;
      const transactionNotConfirmed = err instanceof DelayedError;
      // XXX: maybe spv service should be provided a api for checking the proof status
      const spvProofNotFound = err instanceof SpvRpcError;
      if (transactionDataNotFound || transactionNotConfirmed || spvProofNotFound) {
        await this.moveJobToDelayed(job, token);
        return;
      }
      if (err instanceof InvalidTransactionError) {
        // capture invalid transaction request to Sentry
        Sentry.setContext('transaction', err.data);
      }
      this.cradle.logger.error(err);
      Sentry.captureException(err);
      throw err;
    }
  }

  /**
   * Enqueue a transaction request to the Queue, waiting for processing
   * @param request - the transaction request
   */
  public async enqueueTransaction(request: ITransactionRequest): Promise<Job<ITransactionRequest>> {
    const job = await this.queue.add(request.txid, request, {
      jobId: request.txid,
      delay: this.cradle.env.TRANSACTION_QUEUE_JOB_DELAY,
    });
    return job;
  }

  /**
   * Get the transaction request from the queue
   * @param txid - the transaction id
   */
  public async getTransactionRequest(txid: string): Promise<Job<ITransactionRequest> | undefined> {
    const job = await this.queue.getJob(txid);
    return job;
  }

  /**
   * Start the transaction process
   * @param callbacks - the callbacks for the process
   * - onCompleted: the callback when the job is completed
   * - onFailed: the callback when the job is failed
   */
  public async startProcess(callbacks?: IProcessCallbacks): Promise<void> {
    if (callbacks?.onActive) {
      this.worker.on('active', callbacks?.onActive);
    }
    if (callbacks?.onCompleted) {
      this.worker.on('completed', callbacks.onCompleted);
    }
    if (callbacks?.onFailed) {
      this.worker.on('failed', callbacks.onFailed);
    }
    await this.worker.run();
  }

  /**
   * Pause the transaction process
   */
  public async pauseProcess(): Promise<void> {
    await this.worker.pause();
  }

  /**
   * Close the transaction process
   */
  public async closeProcess(): Promise<void> {
    await this.worker.close();
    await this.queue.close();
  }
}
