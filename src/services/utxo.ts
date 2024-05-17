import { sha256 } from 'bitcoinjs-lib/src/crypto';
import { Cradle } from '../container';
import BaseQueueWorker from './base/queue-worker';
import { UTXO } from './bitcoin/schema';
import { z } from 'zod';
import { Job, RepeatOptions } from 'bullmq';
import * as Sentry from '@sentry/node';
import DataCache from './base/data-cache';
import { throttle } from 'lodash';

interface IUTXOSyncRequest {
  btcAddress: string;
}

interface IUTXOSyncJobReturn {
  btcAddress: string;
  utxos: UTXO[];
  // use sha256(latest_txs_id) as the key, so we can check if the data is updated
  txsHash: string;
}

export const UTXO_SYNCER_QUEUE_NAME = 'utxo-syncer-queue';

class UTXOSyncerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UTXOSyncerError';
  }
}

/**
 * UTXOSyncer is used to sync the utxos for the btc address.
 * The utxos are stored in the cache with the btc address as the key,
 * will be resync when the btc address txs are updated.
 */
export default class UTXOSyncer extends BaseQueueWorker<IUTXOSyncRequest, IUTXOSyncJobReturn> {
  private cradle: Cradle;
  private dataCache: DataCache<IUTXOSyncJobReturn>;

  constructor(cradle: Cradle) {
    const defaultJobOptions = UTXOSyncer.getDefaultJobOptions(cradle);
    const repeatStrategy = UTXOSyncer.getRepeatStrategy(cradle);
    super({
      name: UTXO_SYNCER_QUEUE_NAME,
      connection: cradle.redis,
      queue: {
        defaultJobOptions,
        settings: {
          repeatStrategy,
        },
      },
      worker: {
        lockDuration: 60_000,
        removeOnComplete: { count: 0 },
        removeOnFail: { count: 0 },
        settings: {
          repeatStrategy,
        },
      },
    });
    this.cradle = cradle;
    this.dataCache = new DataCache(cradle.redis, {
      prefix: 'utxo-syncer-data',
      schema: z.object({
        btcAddress: z.string(),
        utxos: z.array(UTXO),
        txsHash: z.string(),
      }),
      expire: cradle.env.UTXO_SYNC_DATA_CACHE_EXPIRE,
    });
  }

  public static getDefaultJobOptions(cradle: Cradle) {
    return {
      attempts: 2,
      backoff: {
        type: 'exponential',
        delay: cradle.env.UTXO_SYNC_REPEAT_BASE_DURATION,
      },
    };
  }

  public static getRepeatStrategy(cradle: Cradle) {
    return (millis: number, opts: RepeatOptions) => {
      const { count = 0 } = opts;
      if (count === 0) {
        // immediately process the job when first added
        return millis;
      }
      // Exponential increase the repeat interval, with a maximum of maxDuration
      // For default values (base=10s, max=3600s), the interval will be 10s, 20s, 40s, 80s, 160s, ..., 3600s, 3600s, ...
      const baseDuration = cradle.env.UTXO_SYNC_REPEAT_BASE_DURATION;
      const maxDuration = cradle.env.UTXO_SYNC_REPEAT_MAX_DURATION;
      // Add some random delay to avoid all jobs being processed at the same time
      const duration = Math.min(Math.pow(2, count) * baseDuration, maxDuration) + Math.random() * 1000;
      cradle.logger.info(`[UTXOSyncer] Repeat job ${opts.jobId} in ${duration}ms`);
      return millis + duration;
    };
  }

  /**
   * Capture the job exception to Sentry with the btcAddress tag
   * @param job - the job that failed
   * @param err - the error that caused the job to fail
   */
  private captureJobExceptionToSentryScope(job: Job<IUTXOSyncRequest>, err: Error) {
    const { btcAddress } = job.data;
    Sentry.withScope((scope) => {
      scope.setTag('btcAddress', btcAddress);
      this.cradle.logger.error(err);
      scope.captureException(err);
    });
  }

  public async getUTXOsFromCache(btcAddress: string) {
    const data = await this.dataCache.get(btcAddress);
    if (!data) {
      return null;
    }
    return data.utxos;
  }

  private async _enqueueSyncJob(btcAddress: string) {
    const jobs = await this.queue.getRepeatableJobs();
    const repeatableJob = jobs.find((job) => job.name === btcAddress);

    if (repeatableJob) {
      // Remove the existing repeatable job to update the start date, let the job be processed immediately
      this.cradle.logger.info(`[UTXOSyncer] Remove existing repeatable job for ${btcAddress}`);
      await this.queue.removeRepeatableByKey(repeatableJob.key);
    }

    return this.addJob(
      btcAddress,
      { btcAddress },
      {
        repeat: {
          pattern: 'exponential',
          // bullmq will end the repeat job when the end date is reached
          // https://github.com/taskforcesh/bullmq/blob/cce0774cffcee591407eee4d4530daa37aab3eca/src/classes/repeat.ts#L51
          endDate: Date.now() + this.cradle.env.UTXO_SYNC_REPEAT_EXPRIED_DURATION,
        },
      },
    );
  }

  private enqueueSyncJobThrottle = throttle((address) => this._enqueueSyncJob(address), 1000, {
    leading: true,
  });

  /**
   * Enqueue a sync job for the btc address, with a throttle to avoid too many jobs being enqueued at the same time
   */
  public enqueueSyncJob(btcAddress: string) {
    this.cradle.logger.info(`[UTXOSyncer] Enqueue sync job for ${btcAddress}, ${Date.now()}`);
    return this.enqueueSyncJobThrottle(btcAddress);
  }

  public async process(job: Job<IUTXOSyncRequest>): Promise<IUTXOSyncJobReturn> {
    try {
      const { btcAddress } = job.data;
      const txs = await this.cradle.bitcoin.getAddressTxs({ address: btcAddress });
      const txsHash = sha256(Buffer.from(txs.map((tx) => tx.txid).join(','))).toString();

      // check if the data is updated
      const cached = await this.dataCache.get(btcAddress);
      if (cached && txsHash === cached.txsHash) {
        this.cradle.logger.info(`[UTXOSyncer] ${btcAddress} is up to date, skip sync job`);
        return cached;
      }

      const utxos = await this.cradle.bitcoin.getAddressTxsUtxo({ address: btcAddress });
      const data = { btcAddress, utxos, txsHash };
      return this.dataCache.set(btcAddress, data);
    } catch (e) {
      const { message, stack } = e as Error;
      const error = new UTXOSyncerError(message);
      error.stack = stack;
      this.captureJobExceptionToSentryScope(job, error);
      throw e;
    }
  }
}
