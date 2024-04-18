import { bytes } from '@ckb-lumos/codec';
import { opReturnScriptPubKeyToData, remove0x, transactionToHex } from '@rgbpp-sdk/btc';
import {
  Collector,
  RGBPPLock,
  RGBPP_TX_ID_PLACEHOLDER,
  appendCkbTxWitnesses,
  getBtcTimeLockScript,
  getRgbppLockScript,
  sendCkbTx,
  updateCkbTxWithRealBtcTxId,
} from '@rgbpp-sdk/ckb';
import {
  btcTxIdFromBtcTimeLockArgs,
  buildPreLockArgs,
  calculateCommitment,
  genBtcTimeLockScript,
  genRgbppLockScript,
  lockScriptFromBtcTimeLockArgs,
} from '@rgbpp-sdk/ckb/lib/utils/rgbpp';
import * as Sentry from '@sentry/node';
import { Transaction as BitcoinTransaction } from 'bitcoinjs-lib';
import { DelayedError, Job, Queue, Worker } from 'bullmq';
import { Cradle } from '../container';
import { Transaction } from '../routes/bitcoin/types';
import { CKBRawTransaction, CKBVirtualResult } from '../routes/rgbpp/types';
import { BitcoinSPVError } from './spv';
import { ElectrsAPINotFoundError } from './electrs';
import { BloomFilter } from 'bloom-filters';
import { BI } from '@ckb-lumos/lumos';

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
  retryAllFailedJobs(): Promise<{ txid: string; state: string }[]>;
  startProcess(callbacks?: IProcessCallbacks): Promise<void>;
  pauseProcess(): Promise<void>;
  closeProcess(): Promise<void>;
}

export const TRANSACTION_QUEUE_NAME = 'rgbpp-ckb-transaction-queue';

class InvalidTransactionError extends Error {
  public data: ITransactionRequest;

  constructor(message: string, data: ITransactionRequest) {
    super(message);
    this.name = this.constructor.name;
    this.data = data;
  }
}

class TransactionNotConfirmedError extends Error {
  constructor(txid: string) {
    super(`Transaction not confirmed: ${txid}`);
    this.name = this.constructor.name;
  }
}

class OpReturnNotFoundError extends Error {
  constructor(txid: string) {
    super(`OP_RETURN output not found: ${txid}`);
    this.name = this.constructor.name;
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

  constructor(cradle: Cradle) {
    this.cradle = cradle;
    this.queue = new Queue(TRANSACTION_QUEUE_NAME, {
      connection: cradle.redis,
      defaultJobOptions: this.defaultJobOptions,
    });
    this.worker = new Worker(TRANSACTION_QUEUE_NAME, this.process.bind(this), {
      connection: cradle.redis,
      autorun: false,
      concurrency: 10,
    });
  }

  private get isMainnet() {
    return this.cradle.env.NETWORK === 'mainnet';
  }

  private get rgbppLockScript() {
    return getRgbppLockScript(this.isMainnet);
  }

  private get btcTimeLockScript() {
    return getBtcTimeLockScript(this.isMainnet);
  }

  public get defaultJobOptions() {
    return {
      attempts: this.cradle.env.TRANSACTION_QUEUE_JOB_ATTEMPTS,
      backoff: {
        type: 'exponential',
        delay: this.cradle.env.TRANSACTION_QUEUE_JOB_DELAY,
      },
    };
  }

  private isRgbppLock(lock: CKBComponents.Script) {
    return lock.codeHash === this.rgbppLockScript.codeHash && lock.hashType === this.rgbppLockScript.hashType;
  }

  private isBtcTimeLock(lock: CKBComponents.Script) {
    return lock.codeHash === this.btcTimeLockScript.codeHash && lock.hashType === this.btcTimeLockScript.hashType;
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
   * Clear the btcTxId in the RGBPP_LOCK/BTC_TIME_LOCK script to avoid the mismatch between the CKB and BTC transactions
   * @param ckbRawTx - CKB Raw Transaction
   * @param txid - Bitcoin transaction id
   */
  private async resetOutputLockScript(ckbRawTx: CKBRawTransaction, txid: string) {
    const outputs = ckbRawTx.outputs.map((output) => {
      const { lock } = output;
      if (this.isRgbppLock(lock)) {
        const unpack = RGBPPLock.unpack(lock.args);
        // https://github.com/ckb-cell/rgbpp-sdk/tree/main/examples/rgbpp#what-you-must-know-about-btc-transaction-id
        const btcTxid = bytes.hexify(bytes.bytify(unpack.btcTxid).reverse());
        if (remove0x(btcTxid) !== txid) {
          return output;
        }
        return {
          ...output,
          lock: genRgbppLockScript(buildPreLockArgs(unpack.outIndex), this.isMainnet),
        };
      }
      if (this.isBtcTimeLock(lock)) {
        const btcTxid = btcTxIdFromBtcTimeLockArgs(lock.args);
        if (remove0x(btcTxid) !== txid) {
          return output;
        }
        const toLock = lockScriptFromBtcTimeLockArgs(lock.args);
        return {
          ...output,
          lock: genBtcTimeLockScript(toLock, this.isMainnet),
        };
      }
      return output;
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
      this.cradle.logger.info(`[TransactionManager] Bitcoin Transaction Commitment Mismatch: ${txid}`);
      return false;
    }

    // make sure the CKB Virtual Transaction is valid
    const ckbRawTxWithoutBtcTxId = await this.resetOutputLockScript(ckbRawTx, txid);
    if (commitment !== calculateCommitment(ckbRawTxWithoutBtcTxId)) {
      this.cradle.logger.info(`[TransactionManager] Invalid CKB Virtual Transaction: ${txid}`);
      return false;
    }

    // make sure the Bitcoin transaction is confirmed
    if (!btcTx.status.confirmed) {
      // https://docs.bullmq.io/patterns/process-step-jobs#delaying
      this.cradle.logger.info(`[TransactionManager] Bitcoin Transaction Not Confirmed: ${txid}`);
      throw new TransactionNotConfirmedError(txid);
    }

    this.cradle.logger.info(`[TransactionManager] Transaction Verified: ${txid}`);
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
    const needUpdateCkbTx = ckbRawTx.outputs.some((output) => {
      if (this.isRgbppLock(output.lock)) {
        const { btcTxid } = RGBPPLock.unpack(output.lock.args);
        const txid = remove0x(btcTxid);
        this.cradle.logger.debug(`[TransactionManager] RGBPP_LOCK args txid: ${btcTxid}`);
        return (
          output.lock.codeHash === this.rgbppLockScript.codeHash &&
          output.lock.hashType === this.rgbppLockScript.hashType &&
          txid === RGBPP_TX_ID_PLACEHOLDER
        );
      }
      if (this.isBtcTimeLock(output.lock)) {
        const btcTxid = btcTxIdFromBtcTimeLockArgs(output.lock.args);
        const txid = remove0x(btcTxid);
        this.cradle.logger.debug(`[TransactionManager] BTC_TIME_LOCK args txid: ${txid}`);
        return (
          output.lock.codeHash === this.btcTimeLockScript.codeHash &&
          output.lock.hashType === this.btcTimeLockScript.hashType &&
          txid === RGBPP_TX_ID_PLACEHOLDER
        );
      }
      return false;
    });
    if (needUpdateCkbTx) {
      this.cradle.logger.info(`[TransactionManager] Update CKB Raw Transaction with real BTC txid: ${txid}`);
      ckbRawTx = updateCkbTxWithRealBtcTxId({ ckbRawTx, btcTxId: txid, isMainnet: this.isMainnet });
    }
    return ckbRawTx;
  }

  /**
   * Fix the pool rejected transaction by increasing the fee rate
   * set the needPaymasterCell to true to append the paymaster cell to pay the rest of the fee
   */
  private async fixPoolRejectedTransactionByMinFeeRate(job: Job) {
    job.data.needPaymasterCell = true;
    await this.moveJobToDelayed(job);
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
        throw new InvalidTransactionError('Invalid transaction', job.data);
      }

      const ckbRawTx = this.getCkbRawTxWithRealBtcTxid(ckbVirtualResult, txid);
      // bitcoin JSON-RPC gettransaction is wallet only
      // we need to use electrs to get the transaction hex and index in block
      const [hex, rgbppApiSpvProof] = await Promise.all([
        this.cradle.electrs.getTransactionHex(txid),
        this.cradle.bitcoinSPV.getTxProof(txid),
      ]);
      // using for spv proof, we need to remove the witness data from the transaction
      const hexWithoutWitness = transactionToHex(BitcoinTransaction.fromHex(hex), false);
      let signedTx = await appendCkbTxWitnesses({
        ckbRawTx,
        btcTxBytes: hexWithoutWitness,
        rgbppApiSpvProof,
      })!;

      // append paymaster cell and sign the transaction if needed
      if (ckbVirtualResult.needPaymasterCell) {
        if (this.cradle.paymaster.enablePaymasterReceivesUTXOCheck) {
          // make sure the paymaster received a UTXO as container fee
          const hasPaymasterUTXO = this.cradle.paymaster.hasPaymasterReceivedBtcUTXO(btcTx);
          if (!hasPaymasterUTXO) {
            this.cradle.logger.info(`[TransactionManager] Paymaster receives UTXO not found: ${txid}`);
            throw new InvalidTransactionError('Paymaster receives UTXO not found', job.data);
          }
        } else {
          this.cradle.logger.warn(`[TransactionManager] Paymaster receives UTXO check disabled`);
        }

        const tx = await this.cradle.paymaster.appendCellAndSignTx(txid, {
          ...ckbVirtualResult,
          ckbRawTx: signedTx!,
        });
        signedTx = tx as CKBRawTransaction;
      }
      this.cradle.logger.debug(`[TransactionManager] Transaction signed: ${JSON.stringify(signedTx)}`);

      try {
        const txHash = await sendCkbTx({
          collector: new Collector({
            ckbNodeUrl: this.cradle.env.CKB_RPC_URL,
            ckbIndexerUrl: this.cradle.env.CKB_RPC_URL,
          }),
          signedTx,
        });
        job.returnvalue = txHash;
        this.cradle.logger.info(`[TransactionManager] Transaction sent: ${txHash}`);

        await this.waitForTranscationConfirmed(txHash);
        this.cradle.logger.info(`[TransactionManager] Transaction confirmed: ${txHash}`);
        // mark the paymaster cell as spent to avoid double spending
        if (ckbVirtualResult.needPaymasterCell) {
          this.cradle.logger.info(`[TransactionManager] Mark paymaster cell as spent: ${txHash}`);
          await this.cradle.paymaster.markPaymasterCellAsSpent(txid, signedTx!);
        }
        return txHash;
      } catch (err) {
        // fix the pool rejected transaction by increasing the fee rate
        if (err instanceof Error && err.message.includes('PoolRejectedTransactionByMinFeeRate')) {
          await this.fixPoolRejectedTransactionByMinFeeRate(job);
          return;
        }
        // mark the paymaster cell as unspent if the transaction failed
        this.cradle.paymaster.markPaymasterCellAsUnspent(txid, signedTx!);
        throw err;
      }
    } catch (err) {
      const { ckbVirtualResult, txid } = job.data;
      this.cradle.logger.debug(err);
      if (err instanceof ElectrsAPINotFoundError) {
        // move the job to delayed queue if the transaction is not found yet
        // only delay the job when the job is created less than 1 hour to make sure the transaction is existed
        // let the job failed if the transaction is not found after 1 hour
        const { TRANSACTION_QUEUE_JOB_DELAY, TRANSACTION_QUEUE_JOB_ATTEMPTS } = this.cradle.env;
        // for example, if the delay is 120s and the attempts is 6, the not found tolerance time is 120 * (2 ** 6) ~= 2 hours
        const notFoundToleranceTime = TRANSACTION_QUEUE_JOB_DELAY * 2 ** TRANSACTION_QUEUE_JOB_ATTEMPTS;
        if (Date.now() - job.timestamp < notFoundToleranceTime) {
          await this.moveJobToDelayed(job, token);
          return;
        }
      }

      // move the job to delayed queue if the transaction not confirmed or spv proof not found yet
      const transactionNotConfirmed = err instanceof TransactionNotConfirmedError;
      const spvProofNotReady = err instanceof BitcoinSPVError;
      if (transactionNotConfirmed || spvProofNotReady) {
        await this.moveJobToDelayed(job, token);
        return;
      }
      Sentry.setTag('txid', txid);
      Sentry.setContext('job', {
        txid,
        ckbVirtualResult: {
          ...ckbVirtualResult,
          // serialize the ckbRawTx to string, otherwise it will be [object]
          ckbRawTx: JSON.stringify(ckbVirtualResult.ckbRawTx),
        },
      });
      this.cradle.logger.error(err);
      Sentry.captureException(err);
      throw err;
    }
  }

  /**
   * Retry missing transactions
   * retry the mempool missing transactions when the blockchain block is confirmed
   */
  public async retryMissingTransactions() {
    const blockchainInfo = await this.cradle.bitcoind.getBlockchainInfo();
    // get the block height that has latest one confirmation
    // make sure the electrs and spv service is synced with the bitcoind
    const targetHeight = blockchainInfo.blocks - 1;

    const previousHeight = await this.cradle.redis.get('missing-transactions-height');
    const startHeight = BI.from(previousHeight ?? targetHeight - 1).toNumber();

    if (targetHeight > startHeight) {
      this.cradle.logger.info(`[TransactionManager] Missing transactions handling started`);
      // get all the txids from previousHeight to currentHeight
      const heights = Array.from({ length: targetHeight - startHeight }, (_, i) => startHeight + i + 1);
      const txidsGroups = await Promise.all(
        heights.map(async (height) => {
          const blockHash = await this.cradle.electrs.getBlockHashByHeight(height);
          return this.cradle.electrs.getBlockTxIdsByHash(blockHash);
        }),
      );
      const txids = txidsGroups.flat();
      // create a bloom filter to test if the txid is in the filter
      const filter = BloomFilter.create(txids.length, 0.01);
      txids.forEach((txid) => filter.add(txid));
      // get all failed jobs from the queue and retry the transactions that are missing
      const jobs = await this.queue.getJobs(['failed']);
      await Promise.all(
        jobs.map(async (job) => {
          const txid = job.id as string;
          if (filter.has(txid)) {
            this.cradle.logger.info(`[TransactionManager] Retry missing transaction: ${txid}`);
            await job.retry();
          }
        }),
      );
      await this.cradle.redis.set('missing-transactions-height', BI.from(targetHeight).toHexString());
    }
  }

  /**
   * Get the queue job counts
   */
  public async getQueueJobCounts() {
    const counts = await this.queue.getJobCounts();
    return counts;
  }

  /**
   * Check if the worker is running
   */
  public async isWorkerRunning() {
    return this.worker.isRunning();
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
   * Retry all failed jobs in the queue
   * @param maxAttempts - the max attempts to retry
   */
  public async retryAllFailedJobs(maxAttempts?: number): Promise<{ txid: string; state: string }[]> {
    let jobs = await this.queue.getJobs(['failed']);
    if (maxAttempts !== undefined) {
      jobs = jobs.filter((job) => job.attemptsMade <= maxAttempts);
    }
    const results = await Promise.all(
      jobs.map(async (job) => {
        this.cradle.logger.info(`[TransactionManager] Retry failed job: ${job.id}`);
        await job.retry();
        const state = await job.getState();
        return {
          txid: job.id!,
          state,
        };
      }),
    );
    return results;
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
  }
}
