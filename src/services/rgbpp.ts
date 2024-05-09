import { UTXO } from './bitcoin/schema';
import pLimit from 'p-limit';
import asyncRetry from 'async-retry';
import { Cradle } from '../container';
import { CKBIndexerQueryOptions } from '@ckb-lumos/ckb-indexer/lib/type';
import { buildRgbppLockArgs, genRgbppLockScript } from '@rgbpp-sdk/ckb';
import * as Sentry from '@sentry/node';
import { Cell, Script } from '@ckb-lumos/lumos';
import { Job, Queue, Worker } from 'bullmq';

type RgbppUtxoCellsPair = {
  utxo: UTXO;
  cells: Cell[];
};

interface IRgbppCollectRequest {
  utxos: UTXO[];
}

interface IRgbppCollectJobReturn {
  [key: string]: Cell[];
}

export default class RgbppCollector {
  private cradle: Cradle;
  private limit: pLimit.Limit;
  private queue: Queue<IRgbppCollectRequest>;
  private worker: Worker<IRgbppCollectRequest>;

  public jobQueueName = 'rgbpp-collector-queue';

  constructor(cradle: Cradle) {
    this.cradle = cradle;
    this.limit = pLimit(cradle.env.CKB_RPC_MAX_CONCURRENCY);

    this.queue = new Queue(this.jobQueueName, {
      connection: cradle.redis,
    });
    this.worker = new Worker(this.jobQueueName, this.process.bind(this), {
      connection: cradle.redis,
      autorun: false,
    });
  }

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

    return cells;
  }

  public async process(job: Job<IRgbppCollectRequest>) {
    const { utxos } = job.data;
    const pairs = await this.collectRgbppUtxoCellsPairs(utxos);
    const data = pairs.reduce((acc, { utxo, cells }) => {
      if (cells.length > 0) {
        const key = `${utxo.txid}:${utxo.vout}`;
        acc[key] = cells;
      }
      return acc;
    }, {} as IRgbppCollectJobReturn);
    job.returnvalue = data;
    return data;
  }
}
