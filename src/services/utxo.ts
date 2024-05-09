import { sha256 } from 'bitcoinjs-lib/src/crypto';
import { Cradle } from '../container';
import BaseQueueWorker from './base/queue-worker';
import { UTXO } from './bitcoin/schema';
import { z } from 'zod';
import { Job } from 'bullmq';

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
    super({
      name: UTXO_SYNCER_QUEUE_NAME,
      connection: cradle.redis,
      queue: {
        settings: {
          repeatStrategy: UTXOSyncer.getRepeatStrategy,
        },
      },
      worker: {
        lockDuration: 60_000,
        removeOnComplete: { count: 0 },
        removeOnFail: { count: 0 },
      },
    });
    this.cradle = cradle;
  }

  public static getRepeatStrategy() {
    // FIXME: implement the repeat strategy for the queue
    // exponentially increase the delay time
    return Date.now() + 1000 * 60;
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
    return this.addJob(btcAddress, { btcAddress });
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
