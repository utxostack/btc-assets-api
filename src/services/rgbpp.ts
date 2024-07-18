import pLimit from 'p-limit';
import asyncRetry from 'async-retry';
import * as Sentry from '@sentry/node';
import {
  IndexerCell,
  leToU128,
  isScriptEqual,
  buildPreLockArgs,
  buildRgbppLockArgs,
  genRgbppLockScript,
  getRgbppLockScript,
  genBtcTimeLockArgs,
  getBtcTimeLockScript,
  btcTxIdFromBtcTimeLockArgs,
  calculateCommitment,
  BTCTimeLock,
  RGBPP_TX_ID_PLACEHOLDER,
  RGBPP_TX_INPUTS_MAX_LENGTH,
} from '@rgbpp-sdk/ckb';
import { remove0x } from '@rgbpp-sdk/btc';
import { unpackRgbppLockArgs } from '@rgbpp-sdk/btc/lib/ckb/molecule';
import { groupBy, cloneDeep, uniq } from 'lodash';
import { z } from 'zod';
import { Job } from 'bullmq';
import { BI, RPC, Script } from '@ckb-lumos/lumos';
import { TransactionWithStatus } from '@ckb-lumos/base';
import { computeScriptHash } from '@ckb-lumos/lumos/utils';
import { Cell, XUDTBalance } from '../routes/rgbpp/types';
import { Transaction, UTXO } from './bitcoin/schema';
import BaseQueueWorker from './base/queue-worker';
import DataCache from './base/data-cache';
import { Cradle } from '../container';
import { TestnetTypeMap } from '../constants';
import { tryGetCommitmentFromBtcTx } from '../utils/commitment';

type GetCellsParams = Parameters<RPC['getCells']>;
export type SearchKey = GetCellsParams[0];
export type CKBBatchRequest = { exec: () => Promise<{ objects: IndexerCell[] }[]> };

export type RgbppUtxoCellsPair = {
  utxo: UTXO;
  cells: Cell[];
};

interface IRgbppCollectRequest {
  btcAddress: string;
}

interface IRgbppCollectJobReturn {
  [key: string]: Cell[];
}

export interface IProcessCallbacks {
  onActive?: (job: Job<IRgbppCollectRequest>) => void;
  onCompleted?: (job: Job<IRgbppCollectRequest>) => void;
  onFailed?: (job: Job<IRgbppCollectRequest> | undefined, err: Error) => void;
}

export const RGBPP_COLLECTOR_QUEUE_NAME = 'rgbpp-collector-queue';

class RgbppCollectorError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RgbppCollectorError';
  }
}

/**
 * RgbppCollector is used to collect the cells for the utxos.
 * The cells are stored in the cache with the btc address as the key,
 * will be recollected when the utxos are updated or new collect job is enqueued.
 */
export default class RgbppCollector extends BaseQueueWorker<IRgbppCollectRequest, IRgbppCollectJobReturn> {
  private readonly limit: pLimit.Limit;
  private dataCache: DataCache<IRgbppCollectJobReturn>;

  constructor(private cradle: Cradle) {
    super({
      name: RGBPP_COLLECTOR_QUEUE_NAME,
      connection: cradle.redis,
      worker: {
        lockDuration: 60_000,
        removeOnComplete: { count: 0 },
        removeOnFail: { count: 0 },
      },
    });
    this.dataCache = new DataCache(cradle.redis, {
      prefix: 'rgbpp-collector-data',
      schema: z.record(z.array(Cell)),
      expire: cradle.env.RGBPP_COLLECT_DATA_CACHE_EXPIRE,
    });
    this.limit = pLimit(100);
  }

  private get isMainnet() {
    return this.cradle.env.NETWORK === 'mainnet';
  }

  private get testnetType() {
    return TestnetTypeMap[this.cradle.env.NETWORK];
  }

  private get rgbppLockScript() {
    return getRgbppLockScript(this.isMainnet, this.testnetType);
  }

  private get btcTimeLockScript() {
    return getBtcTimeLockScript(this.isMainnet, this.testnetType);
  }

  private isRgbppLock(lock: CKBComponents.Script) {
    return lock.codeHash === this.rgbppLockScript.codeHash && lock.hashType === this.rgbppLockScript.hashType;
  }

  private isBtcTimeLock(lock: CKBComponents.Script) {
    return lock.codeHash === this.btcTimeLockScript.codeHash && lock.hashType === this.btcTimeLockScript.hashType;
  }

  /**
   * Capture the exception to the sentry scope with the btc address and utxos
   * @param job - the job that failed
   * @param err - the error
   */
  private captureJobExceptionToSentryScope(job: Job<IRgbppCollectRequest>, err: Error) {
    const { btcAddress } = job.data;
    Sentry.withScope((scope) => {
      scope.setTag('btcAddress', btcAddress);
      this.cradle.logger.error(err);
      scope.captureException(err);
    });
  }

  /**
   * Save the rgbpp utxo cells pairs to the cache
   * @param btcAddress - the btc address
   * @param pairs - the rgbpp utxo cells pairs
   */
  private async saveRgbppUtxoCellsPairsToCache(btcAddress: string, pairs: RgbppUtxoCellsPair[]) {
    const data = pairs.reduce((acc, { utxo, cells }) => {
      const key = `${utxo.txid}:${utxo.vout}`;
      acc[key] = cells;
      return acc;
    }, {} as IRgbppCollectJobReturn);
    this.dataCache.set(btcAddress, data);
    return data;
  }

  /**
   * Get the rgbpp balance by cells
   * @param cells - the cells to calculate the balance
   */
  public async getRgbppBalanceByCells(cells: Cell[]) {
    const xudtBalances: Record<
      string,
      Omit<XUDTBalance, 'total_amount' | 'available_amount' | 'pending_amount'> & {
        amount: string;
      }
    > = {};
    for (const cell of cells) {
      const type = cell.cellOutput.type!;
      const typeHash = computeScriptHash(type);
      const infoCellData = await this.cradle.ckb.getInfoCellData(type);
      // https://blog.cryptape.com/enhance-sudts-programmability-with-xudt#heading-xudt-data-structures
      const amount = BI.from(leToU128(remove0x(cell.data).slice(0, 32))).toHexString();
      if (infoCellData) {
        if (!xudtBalances[typeHash]) {
          xudtBalances[typeHash] = {
            ...infoCellData,
            amount: amount,
            type_hash: typeHash,
            type_script: type,
          };
        } else {
          xudtBalances[typeHash].amount = BI.from(xudtBalances[typeHash].amount).add(BI.from(amount)).toHexString();
        }
      }
    }
    return xudtBalances;
  }

  /**
   * Get the rgbpp cells batch request for the utxos
   * @param utxos - the utxos to collect
   * @param typeScript - the type script to filter the cells
   */
  public async getRgbppCellsByBatchRequest(utxos: UTXO[], typeScript?: Script) {
    const batchRequest: CKBBatchRequest = this.cradle.ckb.rpc.createBatchRequest(
      utxos.map((utxo: UTXO) => {
        const { txid, vout } = utxo;
        const args = buildRgbppLockArgs(vout, txid);
        const searchKey: SearchKey = {
          script: genRgbppLockScript(args, this.isMainnet, this.testnetType),
          scriptType: 'lock',
        };
        if (typeScript) {
          searchKey.filter = {
            script: typeScript,
          };
        }
        // TODO: In extreme cases, the num of search target cells may be more than limit=0x64=100
        // Priority: Low
        const params: GetCellsParams = [searchKey, 'desc', '0x64'];
        return ['getCells', ...params];
      }),
    );
    const result = await batchRequest.exec();
    const cells = result.map(({ objects }) => {
      return objects.map((indexerCell) => {
        const { output, outPoint, outputData, blockNumber, txIndex } = indexerCell;
        return {
          outPoint,
          cellOutput: output,
          data: outputData,
          blockNumber,
          txIndex,
        } as Cell;
      });
    });
    return cells;
  }

  /**
   * Get the rgbpp utxo cells pairs
   */
  public async getRgbppUtxoCellsPairs(btcAddress: string, utxos: UTXO[], noCache?: boolean) {
    if (this.cradle.env.RGBPP_COLLECT_DATA_CACHE_ENABLE && !noCache) {
      const cached = await this.dataCache.get(btcAddress);
      if (cached) {
        const pairs = utxos
          .map((utxo) => {
            const key = `${utxo.txid}:${utxo.vout}`;
            return { utxo, cells: cached[key] || [] };
          })
          .filter(({ cells }) => cells.length > 0);
        return pairs;
      }
    }
    const pairs = await this.collectRgbppUtxoCellsPairs(utxos);
    await this.saveRgbppUtxoCellsPairsToCache(btcAddress, pairs);
    return pairs;
  }

  /**
   * Collect the cells for the utxos, return the utxo and the cells
   * @param utxos - the utxos to collect
   * @param typeScript - the type script to filter the cells
   */
  public async collectRgbppUtxoCellsPairs(utxos: UTXO[], typeScript?: Script): Promise<RgbppUtxoCellsPair[]> {
    const bucketSize = Math.ceil(utxos.length / this.cradle.env.CKB_RPC_MAX_CONCURRENCY);
    // split the utxos into buckets, every bucket has almost the same size
    const buckets = groupBy(utxos, () => Math.floor(Math.random() * bucketSize)) as Record<number, UTXO[]>;
    const data = await Promise.all(
      Object.values(buckets).map((group: UTXO[]) => {
        return this.limit(() =>
          asyncRetry(
            async () => {
              const batchCells = await this.getRgbppCellsByBatchRequest(group, typeScript);
              return batchCells.map((cells: Cell[], index: number) => {
                const utxo = group[index];
                return { utxo, cells };
              });
            },
            {
              retries: 2,
            },
          ),
        );
      }),
    );
    const pairs = data.flat().filter(({ cells }: RgbppUtxoCellsPair) => cells.length > 0);
    return pairs;
  }

  public async queryRgbppLockTxByBtcTx(btcTx: Transaction) {
    // Only query the first RGBPP_TX_INPUTS_MAX_LENGTH transactions for performance reasons
    const maxRecords = `0x${RGBPP_TX_INPUTS_MAX_LENGTH.toString(16)}`;
    const batchRequest = this.cradle.ckb.rpc.createBatchRequest(
      btcTx.vout.map((_, index) => {
        const args = buildRgbppLockArgs(index, btcTx.txid);
        const lock = genRgbppLockScript(args, this.isMainnet, this.testnetType);
        const searchKey: SearchKey = {
          script: lock,
          scriptType: 'lock',
        };
        return ['getTransactions', searchKey, 'asc', maxRecords];
      }),
    );
    type getTransactionsResult = ReturnType<typeof this.cradle.ckb.rpc.getTransactions<false>>;
    const transactions: Awaited<getTransactionsResult>[] = await batchRequest.exec();
    for (const tx of transactions) {
      for (const indexerTx of tx.objects) {
        const ckbTx = await this.cradle.ckb.rpc.getTransaction(indexerTx.txHash);
        const isIsomorphic = await this.isIsomorphicTx(btcTx, ckbTx.transaction);
        // console.log('isIsomorphic', btcTx.txid, ckbTx.transaction.hash, isIsomorphic);
        if (isIsomorphic) {
          return indexerTx;
        }
      }
    }
    return null;
  }

  public async queryBtcTimeLockTxByBtcTxId(btcTxId: string) {
    // XXX: unstable, need to be improved: https://github.com/ckb-cell/btc-assets-api/issues/45
    const btcTimeLockTxs = await this.cradle.ckb.indexer.getTransactions({
      script: {
        ...this.btcTimeLockScript,
        args: '0x',
      },
      scriptType: 'lock',
    });

    const txHashes = uniq(btcTimeLockTxs.objects.map(({ txHash }) => txHash));
    const batchRequest = this.cradle.ckb.rpc.createBatchRequest(txHashes.map((txHash) => ['getTransaction', txHash]));
    const transactions: TransactionWithStatus[] = await batchRequest.exec();
    if (transactions.length > 0) {
      for (const tx of transactions) {
        const isBtcTimeLockTx = tx.transaction.outputs.some((output) => {
          if (!isScriptEqual(output.lock, this.btcTimeLockScript)) {
            return false;
          }
          const outputBtcTxId = btcTxIdFromBtcTimeLockArgs(output.lock.args);
          return remove0x(outputBtcTxId) === btcTxId;
        });
        if (isBtcTimeLockTx) {
          return tx;
        }
      }
    }
    return null;
  }

  async isIsomorphicTx(btcTx: Transaction, ckbTx: CKBComponents.RawTransaction, validateCommitment?: boolean) {
    const replaceLockArgsWithPlaceholder = (cell: CKBComponents.CellOutput, index: number) => {
      if (this.isRgbppLock(cell.lock)) {
        cell.lock.args = buildPreLockArgs(index + 1);
      }
      if (this.isBtcTimeLock(cell.lock)) {
        const lockArgs = BTCTimeLock.unpack(cell.lock.args);
        cell.lock.args = genBtcTimeLockArgs(lockArgs.lockScript, RGBPP_TX_ID_PLACEHOLDER, lockArgs.after);
      }
      return cell;
    };

    // Find the commitment from the btc_tx
    const btcTxCommitment = tryGetCommitmentFromBtcTx(btcTx);
    if (!btcTxCommitment) {
      return false;
    }

    // Check inputs:
    // 1. Find the last index of the type inputs
    // 2. Check if all rgbpp_lock inputs can be found in the btc_tx.vin
    // 3. Check if the inputs contain at least one rgbpp_lock cell (as L1-L1 and L1-L2 transactions should have)
    let lastTypeInputIndex = -1;
    let foundRgbppLockInput = false;
    const outPoints = ckbTx.inputs.map((input) => input.previousOutput!);
    const inputs = await this.cradle.ckb.getInputCellsByOutPoint(outPoints);
    for (let i = 0; i < inputs.length; i++) {
      if (inputs[i].type) {
        lastTypeInputIndex = i;
        const isRgbppLock = this.isRgbppLock(inputs[i].lock);
        if (isRgbppLock) {
          foundRgbppLockInput = true;
          const btcInput = btcTx.vin[i];
          const rgbppLockArgs = unpackRgbppLockArgs(inputs[i].lock.args);
          if (
            !btcInput ||
            btcInput.txid !== remove0x(rgbppLockArgs.btcTxid) ||
            btcInput.vout !== rgbppLockArgs.outIndex
          ) {
            return false;
          }
        }
      }
    }
    // XXX: In some type of RGB++ transactions, the inputs may not contain any rgbpp_lock cells
    // We add this check to ensure this function only validates for L1-L1 and L1-L2 transactions
    if (!foundRgbppLockInput) {
      return false;
    }

    // Check outputs:
    // 1. Find the last index of the type outputs
    // 2. Check if all type outputs are rgbpp_lock/btc_time_lock cells
    // 3. Check if each rgbpp_lock cell has an isomorphic UTXO in the btc_tx.vout
    // 4. Check if each btc_time_lock cell contains the corresponding btc_txid in the lock args
    // 5. Check if the outputs contain at least one rgbpp_lock/btc_time_lock cell
    let lastTypeOutputIndex = -1;
    for (let i = 0; i < ckbTx.outputs.length; i++) {
      const ckbOutput = ckbTx.outputs[i];
      const isRgbppLock = this.isRgbppLock(ckbOutput.lock);
      const isBtcTimeLock = this.isBtcTimeLock(ckbOutput.lock);
      if (isRgbppLock) {
        const rgbppLockArgs = unpackRgbppLockArgs(ckbOutput.lock.args);
        const btcTxId = remove0x(rgbppLockArgs.btcTxid);
        if (btcTxId !== RGBPP_TX_ID_PLACEHOLDER && (btcTxId !== btcTx.txid || !btcTx.vout[rgbppLockArgs.outIndex])) {
          return false;
        }
      }
      if (isBtcTimeLock) {
        const btcTxId = remove0x(btcTxIdFromBtcTimeLockArgs(ckbOutput.lock.args));
        if (btcTxId !== RGBPP_TX_ID_PLACEHOLDER && btcTx.txid !== btcTxId) {
          return false;
        }
      }
      if (ckbOutput.type) {
        lastTypeOutputIndex = i;
      }
    }
    if (lastTypeOutputIndex < 0) {
      return false;
    }

    // Cut the ckb_tx to simulate how the ckb_virtual_tx looks like
    const ckbVirtualTx = cloneDeep(ckbTx);
    ckbVirtualTx.inputs = ckbVirtualTx.inputs.slice(0, Math.max(lastTypeInputIndex, 0) + 1);
    ckbVirtualTx.outputs = ckbVirtualTx.outputs.slice(0, lastTypeOutputIndex + 1).map(replaceLockArgsWithPlaceholder);

    // Copy ckb_tx and change output lock args to placeholder args
    const ckbPlaceholderTx = cloneDeep(ckbTx);
    ckbPlaceholderTx.outputs = ckbPlaceholderTx.outputs.map(replaceLockArgsWithPlaceholder);
    if (!validateCommitment) {
      return true;
    }

    // Generate commitment with the ckb_tx/ckb_virtual_tx, then compare it with the btc_tx commitment.
    // If both commitments don't match the btc_tx commitment:
    // 1. The ckb_tx is not the isomorphic transaction of the btc_tx (this is the usual case)
    // 2. The commitment calculation logic differs from the one used in the btc_tx/ckb_tx
    const ckbTxCommitment = calculateCommitment(ckbPlaceholderTx);
    const ckbVirtualTxCommitment = calculateCommitment(ckbVirtualTx);
    const btcTxCommitmentHex = btcTxCommitment.toString('hex');
    return btcTxCommitmentHex === ckbVirtualTxCommitment || btcTxCommitmentHex === ckbTxCommitment;
  }

  /**
   * Enqueue a collect job to the queue
   */
  public async enqueueCollectJob(btcAddress: string, allowDuplicate?: boolean): Promise<Job<IRgbppCollectRequest>> {
    let jobId = btcAddress;
    if (allowDuplicate) {
      // add a timestamp to the job id to allow duplicate jobs
      // used for the case that the utxos are updated
      jobId = `${btcAddress}:${Date.now()}`;
    }
    return this.addJob(
      jobId,
      { btcAddress },
      {
        removeOnComplete: true,
        removeOnFail: true,
      },
    );
  }

  /**
   * Process the collect job, collect the cells for the utxos
   * concurrently controlled by the CKB_RPC_MAX_CONCURRENCY
   * retry 2 times if failed, and return the utxo and cells
   */
  public async process(job: Job<IRgbppCollectRequest>) {
    try {
      const { btcAddress } = job.data;
      const utxos = await this.cradle.utxoSyncer.getUtxosByAddress(btcAddress);
      const pairs = await this.collectRgbppUtxoCellsPairs(utxos);
      await this.saveRgbppUtxoCellsPairsToCache(btcAddress, pairs);
    } catch (e) {
      const { message, stack } = e as Error;
      const error = new RgbppCollectorError(message);
      error.stack = stack;
      this.captureJobExceptionToSentryScope(job, error);
      throw e;
    }
  }
}
