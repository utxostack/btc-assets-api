import { sha256 } from 'bitcoinjs-lib/src/crypto';
import { Cradle } from '../container';
import BaseQueueWorker from './base/queue-worker';
import { UTXO } from './bitcoin/schema';
import { z } from 'zod';
import { Job, RepeatOptions } from 'bullmq';
import { Env } from '../env';

interface IUTXOSyncRequest {
  btcAddress: string;
}

interface IUTXOSyncJobReturn {
  btcAddress: string;
  utxos: UTXO[];
  // use sha256(latest_txs_id) as the key, so we can check if the data is updated
  key: string;
}

export const UTXO_SYNCER_QUEUE_NAME = 'utxo-syncer-queue';

export default class UTXOSyncer extends BaseQueueWorker<IUTXOSyncRequest, IUTXOSyncJobReturn> {
  private cradle: Cradle;

  private cacheKeyPrefix = 'cache:utxo-syncer-data';
  private cacheDataSchema = z.object({
    btcAddress: z.string(),
    utxos: z.array(UTXO),
    key: z.string(),
  });

  constructor(cradle: Cradle) {
    const repeatStrategy = UTXOSyncer.getRepeatStrategy(cradle.env);
    super({
      name: UTXO_SYNCER_QUEUE_NAME,
      connection: cradle.redis,
      queue: {
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
  }

  public static getRepeatStrategy(env: Env) {
    return (millis: number, opts: RepeatOptions) => {
      const { count = 0 } = opts;
      if (count === 0) {
        // immediately process the job when first added
        return millis;
      }

      // Exponential increase the repeat interval, with a maximum of maxDuration
      // For default values (base=10s, max=3600s), the interval will be 10s, 20s, 40s, 80s, 160s, ..., 3600s, 3600s, ...
      const baseDuration = env.UTXO_SYNC_REPEAT_BASE_DURATION;
      const maxDuration = env.UTXO_SYNC_REPEAT_MAX_DURATION;
      const duration = Math.min(Math.pow(2, count) * baseDuration, maxDuration);
      console.error('duration', duration);
      return millis + duration;
    };
  }

  // TODO: implement CacheData class to handle cache data
  private async setCacheData(btcAddress: string, data: IUTXOSyncJobReturn) {
    const parsed = this.cacheDataSchema.safeParse(data);
    if (!parsed.success) {
      throw new Error('Invalid data');
    }
    const key = `${this.cacheKeyPrefix}:${btcAddress}`;
    await this.cradle.redis.set(key, JSON.stringify(parsed.data));
    return parsed.data;
  }

  private async getCacheData(btcAddress: string): Promise<IUTXOSyncJobReturn | null> {
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

  public async getUTXOsFromCache(btcAddress: string) {
    const data = await this.getCacheData(btcAddress);
    if (!data) {
      return null;
    }
    return data.utxos;
  }

  public async enqueueSyncJob(btcAddress: string) {
    const jobs = await this.queue.getRepeatableJobs();
    const repeatableJob = jobs.find((job) => job.name === btcAddress);
    if (repeatableJob) {
      // remove the existing repeatable job to update the start date
      // so the job will be processed immediately
      await this.queue.removeRepeatableByKey(repeatableJob.key);
    }

    return this.addJob(
      btcAddress,
      { btcAddress },
      {
        // add a repeatable job to sync utxos every 10 seconds with exponential backoff
        repeat: {
          startDate: Date.now(),
          pattern: 'exponential',
        },
      },
    );
  }

  public async process(job: Job<IUTXOSyncRequest>): Promise<IUTXOSyncJobReturn> {
    const { btcAddress } = job.data;
    const txs = await this.cradle.bitcoin.getAddressTxs({ address: btcAddress });
    const key = sha256(Buffer.from(txs.map((tx) => tx.txid).join(''))).toString();

    // check if the data is updated
    const cached = await this.getCacheData(btcAddress);
    if (cached && key === cached.key) {
      this.cradle.logger.info(`[UTXOSyncer] ${btcAddress} is up to date, skip sync job`);
      return cached;
    }

    const utxos = await this.cradle.bitcoin.getAddressTxsUtxo({ address: btcAddress });
    const data = { btcAddress, utxos, key };
    return this.setCacheData(btcAddress, data);
  }
}
