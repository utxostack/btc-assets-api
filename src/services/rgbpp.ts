import pLimit from 'p-limit';
import asyncRetry from 'async-retry';
import * as Sentry from '@sentry/node';
import {
  IndexerCell,
  leToU128,
  buildRgbppLockArgs,
  genRgbppLockScript,
  btcTxIdAndAfterFromBtcTimeLockArgs,
  RGBPP_TX_ID_PLACEHOLDER,
  RGBPP_TX_INPUTS_MAX_LENGTH,
} from '@rgbpp-sdk/ckb';
import { remove0x } from '@rgbpp-sdk/btc';
import { unpackRgbppLockArgs } from '@rgbpp-sdk/ckb';
import { groupBy, findLastIndex } from 'lodash';
import { z } from 'zod';
import { Job } from 'bullmq';
import { BI, RPC, Script } from '@ckb-lumos/lumos';
import { computeScriptHash } from '@ckb-lumos/lumos/utils';
import { Cell, XUDTBalance } from '../routes/rgbpp/types';
import { Transaction, UTXO } from './bitcoin/schema';
import BaseQueueWorker from './base/queue-worker';
import DataCache from './base/data-cache';
import { Cradle } from '../container';
import { isCommitmentMatchToCkbTx, tryGetCommitmentFromBtcTx } from '../utils/commitment';
import { getRgbppLock, isBtcTimeLock, isRgbppLock } from '../utils/lockscript';
import { IS_MAINNET, TESTNET_TYPE } from '../constants';

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
  private limit: pLimit.Limit;
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
          script: genRgbppLockScript(args, IS_MAINNET, TESTNET_TYPE),
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
        const lock = genRgbppLockScript(args, IS_MAINNET, TESTNET_TYPE);
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
        if (isIsomorphic) {
          return indexerTx;
        }
      }
    }
    return null;
  }

  public async queryBtcTimeLockTxByBtcTx(btcTx: Transaction) {
    const rgbppLock = getRgbppLock();
    const relatedCkbTxs = (
      await Promise.all(
        btcTx.vin.map(({ txid, vout }) => {
          const args = buildRgbppLockArgs(vout, txid);
          return this.cradle.ckb.rpc.getTransactions(
            {
              script: {
                ...rgbppLock,
                args,
              },
              scriptType: 'lock',
              groupByTransaction: true,
            },
            'asc',
            '0x64',
          );
        }),
      )
    )
      .map(({ objects }) => objects)
      .flat();

    for (const tx of relatedCkbTxs) {
      const ckbTx = await this.cradle.ckb.rpc.getTransaction(tx.txHash);
      const isBtcTimeLockTx = ckbTx.transaction.outputs.some((output) => {
        if (!isBtcTimeLock(output.lock)) {
          return false;
        }
        const { btcTxId: outputBtcTxId } = btcTxIdAndAfterFromBtcTimeLockArgs(output.lock.args);
        return remove0x(outputBtcTxId) === btcTx.txid;
      });
      if (isBtcTimeLockTx) {
        return ckbTx;
      }
    }
    return null;
  }

  async isIsomorphicTx(
    btcTx: Transaction,
    ckbTx: CKBComponents.RawTransaction,
    validateCommitment?: boolean,
  ): Promise<boolean> {
    // Find the commitment from the btc_tx
    const btcTxCommitment = tryGetCommitmentFromBtcTx(btcTx);
    if (!btcTxCommitment) {
      return false;
    }

    // Check inputs:
    // 1. Find the last index of the type inputs
    // 2. Check if all rgbpp_lock inputs can be found in the btc_tx.vin (regardless the position)
    // 3. Check if the inputs contain at least one rgbpp_lock cell (as L1-L1 and L1-L2 transactions should have)
    const inputs = await this.cradle.ckb.getInputCellsByOutPoint(ckbTx.inputs.map((input) => input.previousOutput!));
    const lastTypeInputIndex = findLastIndex(inputs, (input) => !!input.cellOutput.type);
    const anyRgbppLockInput = inputs.some((input) => isRgbppLock(input.cellOutput.lock));
    if (!anyRgbppLockInput) {
      return false;
    }
    const allInputsValid = inputs.every((input) => {
      if (!input.cellOutput.type) {
        return true;
      }
      if (!isRgbppLock(input.cellOutput.lock)) {
        return true;
      }
      const rgbppLockArgs = unpackRgbppLockArgs(input.cellOutput.lock.args);
      const matchingBtcInput = btcTx.vin.find(
        (btcInput) => btcInput.txid === remove0x(rgbppLockArgs.btcTxId) && btcInput.vout === rgbppLockArgs.outIndex,
      );
      return !!matchingBtcInput;
    });
    if (!allInputsValid) {
      return false;
    }

    // Check outputs:
    // 1. Find the last index of the type outputs
    // 2. Check if all type outputs are rgbpp_lock or btc_time_lock cells
    // 4. Check if each rgbpp_lock cell has an isomorphic UTXO in the btc_tx.vout
    // 5. Check if each btc_time_lock cell contains the corresponding btc_txid in the lock args
    const lastTypeOutputIndex = findLastIndex(ckbTx.outputs, (output) => !!output.type);
    const allOutputsValid = ckbTx.outputs.every((output) => {
      if (!output.type) {
        return true;
      }
      if (isRgbppLock(output.lock)) {
        const rgbppLockArgs = unpackRgbppLockArgs(output.lock.args);
        const btcTxId = remove0x(rgbppLockArgs.btcTxId);
        if (btcTxId === RGBPP_TX_ID_PLACEHOLDER) {
          return true;
        }
        if (btcTxId === btcTx.txid && btcTx.vout[rgbppLockArgs.outIndex] !== undefined) {
          return true;
        }
      }
      if (isBtcTimeLock(output.lock)) {
        const btcTxId = remove0x(btcTxIdAndAfterFromBtcTimeLockArgs(output.lock.args).btcTxId);
        if (btcTxId === RGBPP_TX_ID_PLACEHOLDER || btcTx.txid === btcTxId) {
          return true;
        }
      }
      return false;
    });
    if (!allOutputsValid) {
      return false;
    }

    // Compare commitment between btc_tx and ckb_tx
    if (!validateCommitment) {
      return true;
    }
    const btcTxCommitmentHex = btcTxCommitment.toString('hex');
    return isCommitmentMatchToCkbTx(btcTxCommitmentHex, ckbTx, lastTypeInputIndex, lastTypeOutputIndex);
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
