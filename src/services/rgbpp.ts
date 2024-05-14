import { UTXO } from './bitcoin/schema';
import pLimit from 'p-limit';
import asyncRetry from 'async-retry';
import { Cradle } from '../container';
import { IndexerCell, buildRgbppLockArgs, genRgbppLockScript } from '@rgbpp-sdk/ckb';
import * as Sentry from '@sentry/node';
import { RPC, Script } from '@ckb-lumos/lumos';
import { Job } from 'bullmq';
import { z } from 'zod';
import { Cell } from '../routes/rgbpp/types';
import BaseQueueWorker from './base/queue-worker';
import DataCache from './base/data-cache';
import { groupBy } from 'lodash';

type GetCellsParams = Parameters<RPC['getCells']>;
type SearchKey = GetCellsParams[0];

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
  private dataCahe: DataCache<IRgbppCollectJobReturn>;

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
    this.dataCahe = new DataCache(cradle.redis, {
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
   * Get the rgbpp cells batch request for the utxos
   * @param utxos - the utxos to collect
   * @param typeScript - the type script to filter the cells
   */
  private getRgbppCellsBatchRequest(utxos: UTXO[], typeScript?: Script) {
    const batchRequest = this.cradle.ckb.rpc.createBatchRequest(
      utxos.map((utxo) => {
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
        const params: GetCellsParams = [searchKey, 'desc', '0x64'];
        return ['getCells', ...params];
      }),
    );
    return batchRequest;
  }

  /**
   * Get the rgbpp cells from cache
   * @param btcAddress - the btc address
   */
  public async getRgbppCellsFromCache(btcAddress: string) {
    const data = await this.dataCahe.get(btcAddress);
    if (!data) {
      return null;
    }
    return Object.values(data).flat();
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
              const batchRequest = this.getRgbppCellsBatchRequest(group, typeScript);
              const response = await batchRequest.exec();
              return response.map(({ objects }: { objects: IndexerCell[] }, index: number) => {
                const utxo = group[index];
                const cells = objects.map((obj) => {
                  const { output, outPoint, outputData, blockNumber, txIndex } = obj;
                  const cell: Cell = {
                    outPoint: outPoint,
                    cellOutput: output,
                    data: outputData,
                    blockNumber,
                    txIndex,
                  };
                  return cell;
                });
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
    const pairs = data.flat().filter(({ cells }) => cells.length > 0);
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
      const data = pairs.reduce((acc, { utxo, cells }) => {
        const key = `${utxo.txid}:${utxo.vout}`;
        acc[key] = cells;
        return acc;
      }, {} as IRgbppCollectJobReturn);
      this.dataCahe.set(btcAddress, data);
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
