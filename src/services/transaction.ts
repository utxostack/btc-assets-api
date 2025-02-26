import { bytes } from '@ckb-lumos/codec';
import { remove0x, transactionToHex } from '@rgbpp-sdk/btc';
import {
  RGBPPLock,
  RGBPP_TX_ID_PLACEHOLDER,
  appendCkbTxWitnesses,
  generateSporeTransferCoBuild,
  getSecp256k1CellDep,
  getSporeTypeDep,
  isClusterSporeTypeSupported,
  updateCkbTxWithRealBtcTxId,
} from '@rgbpp-sdk/ckb';
import {
  btcTxIdAndAfterFromBtcTimeLockArgs,
  buildPreLockArgs,
  calculateCommitment,
  genBtcTimeLockScript,
  genRgbppLockScript,
  lockScriptFromBtcTimeLockArgs,
} from '@rgbpp-sdk/ckb';
import * as Sentry from '@sentry/node';
import { Transaction as BitcoinTransaction } from 'bitcoinjs-lib';
import { DelayedError, Job } from 'bullmq';
import { Cradle } from '../container';
import { Transaction } from '../routes/bitcoin/types';
import { CKBRawTransaction, CKBVirtualResult, Cell } from '../routes/rgbpp/types';
import { BitcoinSPVError } from './spv';
import { BI } from '@ckb-lumos/lumos';
import { CKBRpcError, CKBRPCErrorCodes } from './ckb';
import { cloneDeep } from 'lodash';
import { JwtPayload } from '../plugins/jwt';
import { serializeCellDep } from '@nervosnetwork/ckb-sdk-utils';
import { BitcoinClientAPIError } from './bitcoin';
import { HttpStatusCode } from 'axios';
import BaseQueueWorker from './base/queue-worker';
import { Env } from '../env';
import { getCommitmentFromBtcTx } from '../utils/commitment';
import { isBtcTimeLock, isRgbppLock } from '../utils/lockscript';
import { IS_MAINNET } from '../constants';

export interface ITransactionRequest {
  txid: string;
  ckbVirtualResult: CKBVirtualResult;
  context?: {
    jwt: JwtPayload;
  };
}

export interface IProcessCallbacks {
  onActive?: (job: Job<ITransactionRequest>) => void;
  onCompleted?: (job: Job<ITransactionRequest>) => void;
  onFailed?: (job: Job<ITransactionRequest> | undefined, err: Error) => void;
}

interface ITransactionProcessor {
  enqueueTransaction(request: ITransactionRequest): Promise<Job<ITransactionRequest>>;
  getTransactionRequest(txid: string): Promise<Job<ITransactionRequest> | undefined>;
  retryAllFailedJobs(): Promise<{ txid: string; state: string }[]>;
  startProcess(callbacks?: IProcessCallbacks): Promise<void>;
  pauseProcess(): Promise<void>;
  closeProcess(): Promise<void>;
}

export const TRANSACTION_QUEUE_NAME = 'rgbpp-ckb-transaction-queue';

class InvalidTransactionError extends Error {
  public data?: ITransactionRequest;

  constructor(message: string, data?: ITransactionRequest) {
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

/**
 * TransactionProcessor
 * responsible for processing RGB++ CKB transactions, including:
 * - enqueueing transaction requests to the queue
 * - verifying transaction requests, including checking the commitment
 * - processing transaction when it's confirmed on L1(Bitcoin)
 * - generate RGB_lock witness into the CKB transaction
 * - add paymaster cell and sign the CKB transaction if needed
 * - sending CKB transaction to the network and waiting for confirmation
 */
export default class TransactionProcessor
  extends BaseQueueWorker<ITransactionRequest, string | undefined>
  implements ITransactionProcessor
{
  private cradle: Cradle;
  private isRetryMissingTransactionsRunning = false;

  constructor(cradle: Cradle) {
    const defaultJobOptions = TransactionProcessor.getDefaultJobOptions(cradle.env);
    super({
      name: TRANSACTION_QUEUE_NAME,
      connection: cradle.redis,
      queue: {
        defaultJobOptions,
      },
      worker: {
        concurrency: 10,
      },
    });
    this.cradle = cradle;
  }

  public static getDefaultJobOptions(env: Env) {
    return {
      attempts: env.TRANSACTION_QUEUE_JOB_ATTEMPTS,
      backoff: {
        type: 'exponential',
        delay: env.TRANSACTION_QUEUE_JOB_DELAY,
      },
    };
  }

  /**
   * Clear the btcTxId in the RGBPP_LOCK/BTC_TIME_LOCK script to avoid the mismatch between the CKB and BTC transactions
   * @param ckbRawTx - CKB Raw Transaction
   * @param txid - Bitcoin transaction id
   */
  private async resetOutputLockScript(ckbRawTx: CKBRawTransaction, txid: string) {
    const outputs = ckbRawTx.outputs.map((output) => {
      const { lock } = output;
      if (isRgbppLock(lock)) {
        const unpack = RGBPPLock.unpack(lock.args);
        // https://github.com/ckb-cell/rgbpp-sdk/tree/main/examples/rgbpp#what-you-must-know-about-btc-transaction-id
        const btcTxid = bytes.hexify(bytes.bytify(unpack.btcTxid).reverse());
        if (remove0x(btcTxid) !== txid) {
          return output;
        }
        return {
          ...output,
          lock: genRgbppLockScript(buildPreLockArgs(unpack.outIndex), IS_MAINNET),
        };
      }
      if (isBtcTimeLock(lock)) {
        const { btcTxId } = btcTxIdAndAfterFromBtcTimeLockArgs(lock.args);
        if (remove0x(btcTxId) !== txid) {
          return output;
        }
        const toLock = lockScriptFromBtcTimeLockArgs(lock.args);
        return {
          ...output,
          lock: genBtcTimeLockScript(toLock, IS_MAINNET),
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
   * Get commitment from Bitcoin transactions
   * depended on @rgbpp-sdk/btc opReturnScriptPubKeyToData method
   * @param tx - Bitcoin transaction
   */
  private getCommitmentFromBtcTx(tx: Transaction): Buffer {
    return getCommitmentFromBtcTx(tx);
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
    const btcTxCommitment = this.getCommitmentFromBtcTx(btcTx);
    if (commitment !== btcTxCommitment.toString('hex')) {
      this.cradle.logger.info(`[TransactionProcessor] Bitcoin Transaction Commitment Mismatch: ${txid}`);
      return false;
    }

    // make sure the CKB Virtual Transaction is valid
    const ckbRawTxWithoutBtcTxId = await this.resetOutputLockScript(ckbRawTx, txid);
    if (commitment !== calculateCommitment(ckbRawTxWithoutBtcTxId)) {
      this.cradle.logger.info(`[TransactionProcessor] Invalid CKB Virtual Transaction: ${txid}`);
      return false;
    }

    // make sure the Bitcoin transaction is confirmed
    if (!btcTx.status.confirmed) {
      // https://docs.bullmq.io/patterns/process-step-jobs#delaying
      this.cradle.logger.info(`[TransactionProcessor] Bitcoin Transaction Not Confirmed: ${txid}`);
      throw new TransactionNotConfirmedError(txid);
    }

    this.cradle.logger.info(`[TransactionProcessor] Transaction Verified: ${txid}`);
    return true;
  }

  /**
   * Move job to delayed
   * @param job - the job to move
   * @param token - the token to move the job
   */
  private async moveJobToDelayed(job: Job<ITransactionRequest>, token?: string) {
    this.cradle.logger.info(`[TransactionProcessor] Moving job ${job.id} to delayed queue`);
    const timestamp = Date.now() + this.cradle.env.TRANSACTION_QUEUE_JOB_DELAY;
    await job.moveToDelayed(timestamp, token);
    // https://docs.bullmq.io/patterns/process-step-jobs#delaying
    throw new DelayedError();
  }

  /**
   * Get the CKB Raw Transaction with the real BTC transaction id
   * @param ckbVirtualResult - the CKB Virtual Transaction
   * @param txid - the real BTC transaction id
   */
  private getCkbRawTxWithRealBtcTxid(ckbVirtualResult: CKBVirtualResult, txid: string) {
    let ckbRawTx = ckbVirtualResult.ckbRawTx;
    const needUpdateCkbTx = ckbRawTx.outputs.some((output) => {
      if (isRgbppLock(output.lock)) {
        const { btcTxid } = RGBPPLock.unpack(output.lock.args);
        const txid = remove0x(btcTxid);
        this.cradle.logger.debug(`[TransactionProcessor] RGBPP_LOCK args txid: ${btcTxid}`);
        return txid === RGBPP_TX_ID_PLACEHOLDER;
      }
      if (isBtcTimeLock(output.lock)) {
        const { btcTxId } = btcTxIdAndAfterFromBtcTimeLockArgs(output.lock.args);
        const txid = remove0x(btcTxId);
        this.cradle.logger.debug(`[TransactionProcessor] BTC_TIME_LOCK args txid: ${txid}`);
        return txid === RGBPP_TX_ID_PLACEHOLDER;
      }
      return false;
    });
    if (needUpdateCkbTx) {
      this.cradle.logger.info(`[TransactionProcessor] Update CKB Raw Transaction with real BTC txid: ${txid}`);
      ckbRawTx = updateCkbTxWithRealBtcTxId({ ckbRawTx, btcTxId: txid, isMainnet: IS_MAINNET });
    }
    return ckbRawTx;
  }

  private captureJobExceptionToSentryScope(job: Job<ITransactionRequest>, err: Error) {
    const { ckbVirtualResult, txid, context } = job.data;
    Sentry.withScope((scope) => {
      if (context?.jwt) {
        scope.setTag('token.id', context?.jwt.jti);
        scope.setTag('token.app', context?.jwt.sub);
        scope.setTag('token.domain', context?.jwt.aud);
      }

      scope.setTag('btcTxid', txid);
      scope.setContext('job', {
        btcTxid: txid,
        ckbVirtualResult: {
          ...ckbVirtualResult,
          // serialize the ckbRawTx to string, otherwise it will be [object]
          ckbRawTx: JSON.stringify(ckbVirtualResult.ckbRawTx),
        },
      });
      this.cradle.logger.error(err);
      scope.captureException(err);
    });
  }

  /**
   * Append the transaction witnesses to the CKB transaction using SPV proof
   * @param txid - the transaction id
   * @param ckbRawTx - the CKB Raw Transaction
   */
  private async appendTxWitnesses(txid: string, ckbRawTx: CKBRawTransaction) {
    const [hex, rgbppApiSpvProof] = await Promise.all([
      this.cradle.bitcoin.getTxHex({ txid }),
      this.cradle.spv.getTxProof(txid),
    ]);
    // using for spv proof, we need to remove the witness data from the transaction
    const hexWithoutWitness = transactionToHex(BitcoinTransaction.fromHex(hex), false);
    const signedTx = await appendCkbTxWitnesses({
      ckbRawTx,
      btcTxBytes: hexWithoutWitness,
      rgbppApiSpvProof,
    })!;

    return signedTx;
  }

  /**
   * check if the transaction has spore type dep
   * if the transaction has spore type dep, we need to append the spore cobuild witness to the transaction
   */
  private hasSporeTypeDep(tx: CKBRawTransaction) {
    const sporeTypeDep = getSporeTypeDep(IS_MAINNET);
    const hasSporeTypeDep = tx.cellDeps.some((cellDep) => {
      return serializeCellDep(cellDep) === serializeCellDep(sporeTypeDep);
    });
    return hasSporeTypeDep;
  }

  /**
   * Append the spore cobuild witness to the transaction if the input contains spore cell
   * (support spore transfer only for now, will support more in the future)
   * @param signedTx - the signed CKB transaction
   */
  private async appendSporeCobuildWitness(signedTx: CKBRawTransaction) {
    const inputs = await Promise.all(
      signedTx.inputs.map(async (input) => {
        return this.cradle.ckb.rpc.getLiveCell(input.previousOutput!, true);
      }),
    );
    const sporeLiveCells = inputs
      .filter(({ status, cell }) => {
        return status === 'live' && cell?.output.type && isClusterSporeTypeSupported(cell?.output.type, IS_MAINNET);
      })
      .map((liveCell) => liveCell.cell!);
    if (sporeLiveCells.length > 0) {
      signedTx.witnesses[signedTx.witnesses.length - 1] = generateSporeTransferCoBuild(
        sporeLiveCells,
        signedTx.outputs.slice(0, 1),
      );
    }
    return signedTx;
  }

  /**
   * Append the paymaster cell and sign the transaction if needed
   * @param btcTx - the Bitcoin transaction
   * @param ckbVirtualResult - the CKB virtual result
   * @param signedTx - the signed CKB transaction
   */
  private async appendPaymasterCellAndSignTx(
    btcTx: Transaction,
    ckbVirtualResult: CKBVirtualResult,
    signedTx: CKBRawTransaction,
  ) {
    if (this.cradle.paymaster.enablePaymasterReceivesUTXOCheck) {
      // make sure the paymaster received a UTXO as container fee
      const hasPaymasterUTXO = this.cradle.paymaster.hasPaymasterReceivedBtcUTXO(btcTx);
      if (!hasPaymasterUTXO) {
        this.cradle.logger.info(`[TransactionProcessor] Paymaster receives UTXO not found: ${btcTx.txid}`);
        throw new InvalidTransactionError('Paymaster receives UTXO not found', {
          txid: btcTx.txid,
          ckbVirtualResult,
        });
      }
    } else {
      this.cradle.logger.warn(`[TransactionProcessor] Paymaster receives UTXO check disabled`);
    }

    const isSporeTransfer = this.hasSporeTypeDep(signedTx);
    if (isSporeTransfer) {
      signedTx.witnesses = signedTx.witnesses.slice(0, -1);
    }
    const tx = await this.cradle.paymaster.appendCellAndSignTx(btcTx.txid, {
      ...ckbVirtualResult,
      ckbRawTx: signedTx!,
    });
    if (isSporeTransfer) {
      tx.witnesses.push('0x');
    }
    return tx;
  }

  /**
   * Fix the pool rejected transaction by increasing the fee rate
   * set the needPaymasterCell to true to append the paymaster cell to pay the rest of the fee
   */
  private async fixPoolRejectedTransactionByMinFeeRate(job: Job<ITransactionRequest>) {
    this.cradle.logger.debug(
      `[TransactionProcessor] Fix pool rejected transaction by increasing the fee rate: ${job.data.txid}`,
    );
    const { txid, ckbVirtualResult } = job.data;
    const { ckbRawTx } = ckbVirtualResult;
    // append the secp256k1 cell dep to the transaction
    ckbRawTx.cellDeps.push(getSecp256k1CellDep(IS_MAINNET));
    // update the job data to append the paymaster cell next time
    job.updateData({
      txid,
      ckbVirtualResult: {
        ...ckbVirtualResult,
        ckbRawTx,
        needPaymasterCell: true,
      },
    });
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
      const { ckbVirtualResult, txid } = cloneDeep(job.data);
      const btcTx = await this.cradle.bitcoin.getTx({ txid });
      const isVerified = await this.verifyTransaction({ ckbVirtualResult, txid }, btcTx);
      if (!isVerified) {
        throw new InvalidTransactionError('Invalid transaction', job.data);
      }

      const ckbRawTx = this.getCkbRawTxWithRealBtcTxid(ckbVirtualResult, txid);
      let signedTx = await this.appendTxWitnesses(txid, ckbRawTx);

      try {
        // append paymaster cell and sign the transaction if needed
        if (ckbVirtualResult.needPaymasterCell) {
          signedTx = await this.appendPaymasterCellAndSignTx(btcTx, ckbVirtualResult, signedTx);
        }
        this.cradle.logger.debug(`[TransactionProcessor] Transaction signed: ${JSON.stringify(signedTx)}`);

        // append the spore cobuild witness to the transaction
        if (this.hasSporeTypeDep(signedTx)) {
          signedTx = await this.appendSporeCobuildWitness(signedTx);
        }

        const txHash = await this.cradle.ckb.sendTransaction(signedTx);
        job.returnvalue = txHash;
        this.cradle.logger.info(`[TransactionProcessor] Transaction sent: ${txHash}`);

        await this.cradle.ckb.waitForTranscationConfirmed(txHash);
        this.cradle.logger.info(`[TransactionProcessor] Transaction confirmed: ${txHash}`);
        // mark the paymaster cell as spent to avoid double spending
        if (ckbVirtualResult.needPaymasterCell) {
          this.cradle.logger.info(`[TransactionProcessor] Mark paymaster cell as spent: ${txHash}`);
          await this.cradle.paymaster.markPaymasterCellAsSpent(txid, signedTx!);
        }

        // trigger the UTXO sync job if the cache is enabled
        // after the transaction is confirmed, the UTXO sync job will be triggered to sync the UTXO data
        // then the RGB++ cells cache will be updated with the latest UTXO data
        if (this.cradle.env.UTXO_SYNC_DATA_CACHE_ENABLE) {
          try {
            const addresses = btcTx.vout.map((vout) => vout.scriptpubkey_address).filter((address) => address);
            await Promise.all(addresses.map((address) => this.cradle.utxoSyncer.enqueueSyncJob(address!)));
          } catch (err) {
            // ignore the error if enqueue sync job failed, to avoid the transaction failed
            // already catch the error inside the utxo syncer
          }
        }
        return txHash;
      } catch (err) {
        // fix the pool rejected transaction by increasing the fee rate
        if (
          err instanceof CKBRpcError &&
          err.code === CKBRPCErrorCodes.PoolRejectedTransactionByMinFeeRate &&
          this.cradle.env.TRANSACTION_PAY_FOR_MIN_FEE_RATE_REJECT
        ) {
          await this.fixPoolRejectedTransactionByMinFeeRate(job);
          return;
        }
        // mark the paymaster cell as unspent if the transaction failed
        this.cradle.paymaster.markPaymasterCellAsUnspent(txid, signedTx!);
        throw err;
      }
    } catch (err) {
      this.cradle.logger.debug(err);
      if (err instanceof BitcoinClientAPIError && err.statusCode === HttpStatusCode.NotFound) {
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
      this.captureJobExceptionToSentryScope(job, err as Error);
      throw err;
    }
  }

  /**
   * Retry missing transactions
   * retry the mempool missing transactions when the blockchain block is confirmed
   */
  public async retryMissingTransactions() {
    if (this.isRetryMissingTransactionsRunning) {
      this.cradle.logger.info('Previous retry missing transactions job is still running, skipping...');
      return;
    }

    this.isRetryMissingTransactionsRunning = true;

    try {
      const blockchainInfo = await this.cradle.bitcoin.getBlockchainInfo();
      // get the block height that has latest one confirmation
      const targetHeight = blockchainInfo.blocks - 1;

      const previousHeight = await this.cradle.redis.get('missing-transactions-height');
      const startHeight = BI.from(previousHeight ?? targetHeight - 1).toNumber();

      if (targetHeight <= startHeight) {
        return;
      }

      const failedJobs = await this.queue.getJobs(['failed']);
      const failedJobsMap = new Map(failedJobs.filter((job) => job.id).map((job) => [job.id!, job] as [string, Job]));

      for (let height = startHeight + 1; height <= targetHeight; ) {
        const batchEnd = Math.min(height + this.cradle.env.TRANSACTION_RETRY_BLOCK_BATCH_SIZE - 1, targetHeight);

        this.cradle.logger.debug(`[TransactionProcessor] Processing blocks ${height}-${batchEnd}`);

        await this.processBatch(height, batchEnd, failedJobsMap);
        height = batchEnd + 1;

        await new Promise((resolve) => setTimeout(resolve, this.cradle.env.TRANSACTION_RETRY_BLOCK_BATCH_DELAY));
      }
    } catch (error) {
      this.cradle.logger.error('[TransactionProcessor] Error in retryMissingTransactions:', error);
      throw error;
    } finally {
      this.isRetryMissingTransactionsRunning = false;
    }
  }

  private async processBatch(startHeight: number, endHeight: number, failedJobs: Map<string, Job>) {
    try {
      const blockTxids = new Set<string>();
      const heights = Array.from({ length: endHeight - startHeight + 1 }, (_, i) => startHeight + i);

      const blockTxidsArrays = await Promise.all(
        heights.map(async (height) => {
          const blockHash = await this.cradle.bitcoin.getBlockHeight({ height });
          return this.cradle.bitcoin.getBlockTxids({ hash: blockHash });
        }),
      );

      blockTxidsArrays.forEach((txids) => txids.forEach((txid) => blockTxids.add(txid)));

      const retryJobs = Array.from(blockTxids)
        .filter((txid) => failedJobs.has(txid))
        .map((txid) => failedJobs.get(txid)!.retry());

      this.cradle.logger.debug(
        `[TransactionProcessor] Batch ${startHeight}-${endHeight}: found ${blockTxids.size} transactions, retrying ${retryJobs.length} transactions`,
      );

      await Promise.all(retryJobs);

      await this.cradle.redis.set('missing-transactions-height', BI.from(endHeight).toHexString());
    } catch (error) {
      this.cradle.logger.error(`Error processing batch ${startHeight}-${endHeight}:`, error);
      throw error;
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
   * get pending output cells by txid, get ckb output cells from the uncompleted job
   * @param txid - the transaction id
   */
  public async getPendingOutputCellsByTxid(txid: string): Promise<Cell[]> {
    const job = await this.getTransactionRequest(txid);
    if (!job) {
      return [];
    }

    // get ckb output cells from the uncompleted job only
    const state = await job.getState();
    if (state === 'completed' || state === 'failed') {
      return [];
    }

    const { ckbVirtualResult } = job.data;
    const outputs = ckbVirtualResult.ckbRawTx.outputs;
    return outputs.map((output, index) => {
      return Cell.parse({
        cellOutput: output,
        data: ckbVirtualResult.ckbRawTx.outputsData[index],
      });
    });
  }

  /**
   * get pending input cells by txid, get ckb input cells from the uncompleted job
   * @param txid - the transaction id
   */
  public async getPendingInputCellsByTxid(txid: string): Promise<Cell[]> {
    const job = await this.getTransactionRequest(txid);
    if (!job) {
      return [];
    }

    // get ckb input cells from the uncompleted job only
    const state = await job.getState();
    if (state === 'completed' || state === 'failed') {
      return [];
    }

    const { ckbVirtualResult } = job.data;
    const inputOutPoints = ckbVirtualResult.ckbRawTx.inputs.map((input) => input.previousOutput!);
    return await this.cradle.ckb.getInputCellsByOutPoint(inputOutPoints);
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
        this.cradle.logger.info(`[TransactionProcessor] Retry failed job: ${job.id}`);
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
}
