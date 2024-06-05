import { UTXO } from './bitcoin/schema';
import pLimit from 'p-limit';
import asyncRetry from 'async-retry';
import { Cradle } from '../container';
import { IndexerCell, buildRgbppLockArgs, genRgbppLockScript, leToU128 } from '@rgbpp-sdk/ckb';
import * as Sentry from '@sentry/node';
import { BI, RPC, Script } from '@ckb-lumos/lumos';
import { Job } from 'bullmq';
import { z } from 'zod';
import { Cell, XUDTBalance } from '../routes/rgbpp/types';
import BaseQueueWorker from './base/queue-worker';
import DataCache from './base/data-cache';
import { groupBy } from 'lodash';
import { computeScriptHash } from '@ckb-lumos/lumos/utils';
import { remove0x } from '@rgbpp-sdk/btc';

type GetCellsParams = Parameters<RPC['getCells']>;
type SearchKey = GetCellsParams[0];
type CKBBatchRequest = { exec: () => Promise<{ objects: IndexerCell[] }[]> };

export type RgbppUtxoCellsPair = {
  utxo: UTXO;
  cells: Cell[];
};

interface IRgbppCollectRequest {
  btcAddress: string;
  utxos: UTXO[];
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
 * will be recollect when the utxos are updated or new collect job is enqueued.
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
    const { btcAddress, utxos } = job.data;
    Sentry.withScope((scope) => {
      scope.setTag('btcAddress', btcAddress);
      scope.setContext('utxos', {
        utxos: JSON.stringify(utxos),
      });
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
            type_hash: typeHash,
            amount: amount,
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
          script: genRgbppLockScript(args, process.env.NETWORK === 'mainnet'),
          scriptType: 'lock',
        };
        if (typeScript) {
          searchKey.filter = {
            script: typeScript,
          };
        }
        // TOOD: In extreme cases, the num of search target cells may be more than limit=0x64=100
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

  /**
   * Enqueue a collect job to the queue
   * @param utxos - the utxos to collect
   */
  public async enqueueCollectJob(
    btcAddress: string,
    utxos: UTXO[],
    allowDuplicate?: boolean,
  ): Promise<Job<IRgbppCollectRequest>> {
    let jobId = btcAddress;
    if (allowDuplicate) {
      // add a timestamp to the job id to allow duplicate jobs
      // used for the case that the utxos are updated
      jobId = `${btcAddress}:${Date.now()}`;
    }
    return this.addJob(jobId, { btcAddress, utxos });
  }

  /**
   * Process the collect job, collect the cells for the utxos
   * concurrently controlled by the CKB_RPC_MAX_CONCURRENCY
   * retry 2 times if failed, and return the utxo and cells
   */
  public async process(job: Job<IRgbppCollectRequest>) {
    try {
      const { btcAddress, utxos } = job.data;
      const pairs = await this.collectRgbppUtxoCellsPairs(utxos);
      const data = await this.saveRgbppUtxoCellsPairsToCache(btcAddress, pairs);
      return data;
    } catch (e) {
      const { message, stack } = e as Error;
      const error = new RgbppCollectorError(message);
      error.stack = stack;
      this.captureJobExceptionToSentryScope(job, error);
      throw e;
    }
  }
}
