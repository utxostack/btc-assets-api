import { UTXO } from './bitcoin/schema';
import pLimit from 'p-limit';
import asyncRetry from 'async-retry';
import { Cradle } from '../container';
import { CKBIndexerQueryOptions } from '@ckb-lumos/ckb-indexer/lib/type';
import { buildRgbppLockArgs, genRgbppLockScript } from '@rgbpp-sdk/ckb';
import * as Sentry from '@sentry/node';
import { Script } from '@ckb-lumos/lumos';
import { Job } from 'bullmq';
import { z } from 'zod';
import { Cell } from '../routes/rgbpp/types';
import BaseQueueWorker from './base/queue-worker';

type RgbppUtxoCellsPair = {
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

export default class RgbppCollector extends BaseQueueWorker<IRgbppCollectRequest, IRgbppCollectJobReturn> {
  private limit: pLimit.Limit;

  private cacheKeyPrefix = 'cache:rgbpp-collector-data';
  private cacheDataSchema = z.record(z.array(Cell));

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
    this.limit = pLimit(cradle.env.CKB_RPC_MAX_CONCURRENCY);
  }

  /**
   * Set the cache data for the rgbpp collect job data by btc address
   * @param btcAddress - the btc address
   * @param data - the data to cache
   */
  private async setCacheData(btcAddress: string, data: IRgbppCollectJobReturn) {
    const parsed = this.cacheDataSchema.safeParse(data);
    if (!parsed.success) {
      throw new Error('Invalid data');
    }
    const key = `${this.cacheKeyPrefix}:${btcAddress}`;
    await this.cradle.redis.set(key, JSON.stringify(parsed.data));
  }

  /**
   * Get the cache data for the rgbpp collect job data by btc address
   * @param btcAddress - the btc address
   */
  private async getCacheData(btcAddress: string): Promise<IRgbppCollectJobReturn | null> {
    const key = `${this.cacheKeyPrefix}:${btcAddress}`;
    const data = await this.cradle.redis.get(key);
    if (data) {
      const parsed = this.cacheDataSchema.safeParse(JSON.parse(data));
      if (parsed.success) {
        return parsed.data;
      }
    }
    return null;
  }

  /**
   * Get the rgbpp cells from cache
   * @param btcAddress - the btc address
   */
  public async getRgbppCellsFromCache(btcAddress: string) {
    const data = await this.getCacheData(btcAddress);
    if (!data) {
      return null;
    }
    return Object.values(data).flat();
  }

  /**
   * Get the cells for the utxo, use ckb indexer to query the cells
   * @param utxo - the utxo to collect
   * @param typeScript - the type script to filter the cells
   */
  private async getRgbppCellsByUtxo(utxo: UTXO, typeScript?: Script): Promise<Cell[]> {
    try {
      const { txid, vout } = utxo;
      const args = buildRgbppLockArgs(vout, txid);

      const query: CKBIndexerQueryOptions = {
        lock: genRgbppLockScript(args, process.env.NETWORK === 'mainnet'),
      };

      if (typeScript) {
        query.type = typeScript;
      }

      const collector = this.cradle.ckb.indexer.collector(query).collect();
      const cells: Cell[] = [];
      for await (const cell of collector) {
        cells.push(cell);
      }
      return cells;
    } catch (e) {
      Sentry.withScope((scope) => {
        scope.captureException(e);
      });
      throw e;
    }
  }

  /**
   * Collect the cells for the utxos, return the utxo and the cells
   * @param utxos - the utxos to collect
   * @param typeScript - the type script to filter the cells
   */
  public async collectRgbppUtxoCellsPairs(utxos: UTXO[], typeScript?: Script): Promise<RgbppUtxoCellsPair[]> {
    const cells = await Promise.all(
      utxos.map((utxo) => {
        return this.limit(() =>
          asyncRetry(
            async () => {
              const cells = await this.getRgbppCellsByUtxo(utxo, typeScript);
              return { utxo, cells };
            },
            { retries: 2 },
          ),
        );
      }),
    );

    return cells.filter(({ cells }) => cells.length > 0);
  }

  /**
   * Enqueue a collect job to the queue
   * @param utxos - the utxos to collect
   */
  public async enqueueCollectJob(btcAddress: string, utxos: UTXO[]): Promise<Job<IRgbppCollectRequest>> {
    // use btc address as the job id to prevent duplicate jobs
    return this.queue.add(btcAddress, { btcAddress, utxos }, { jobId: btcAddress });
  }

  /**
   * Process the collect job, collect the cells for the utxos
   * concurrently controlled by the CKB_RPC_MAX_CONCURRENCY
   * retry 2 times if failed, and return the utxo and cells
   */
  public async process(job: Job<IRgbppCollectRequest>) {
    const { btcAddress, utxos } = job.data;
    const pairs = await this.collectRgbppUtxoCellsPairs(utxos);
    const data = pairs.reduce((acc, { utxo, cells }) => {
      const key = `${utxo.txid}:${utxo.vout}`;
      acc[key] = cells;
      return acc;
    }, {} as IRgbppCollectJobReturn);
    this.setCacheData(btcAddress, data);
    return data;
  }
}
