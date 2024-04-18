import { FastifyPluginCallback } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import { Server } from 'http';
import z from 'zod';
import { buildRgbppLockArgs, genRgbppLockScript } from '@rgbpp-sdk/ckb/lib/utils/rgbpp';
import { Cell } from './types';
import { CKBIndexerQueryOptions } from '@ckb-lumos/ckb-indexer/lib/type';

const assetsRoute: FastifyPluginCallback<Record<never, never>, Server, ZodTypeProvider> = (fastify, _, done) => {
  fastify.get(
    '/:btc_txid',
    {
      schema: {
        description: `Get RGB++ assets by BTC txid.`,
        tags: ['RGB++'],
        params: z.object({
          btc_txid: z.string(),
        }),
        response: {
          200: z.array(Cell),
        },
      },
    },
    async (request) => {
      const { btc_txid } = request.params;
      const transaction = await fastify.electrs.getTransaction(btc_txid);
      const cells: Cell[] = [];
      for (let index = 0; index < transaction.vout.length; index++) {
        const args = buildRgbppLockArgs(index, btc_txid);
        const query: CKBIndexerQueryOptions = {
          lock: genRgbppLockScript(args, process.env.NETWORK === 'mainnet'),
        };
        const collector = fastify.ckb.indexer.collector(query).collect();
        for await (const cell of collector) {
          cells.push(cell);
        }
      }
      return cells;
    },
  );

  fastify.get(
    '/:btc_txid/:vout',
    {
      schema: {
        description: 'Get RGB++ assets by btc txid and vout',
        tags: ['RGB++'],
        params: z.object({
          btc_txid: z.string(),
          vout: z.coerce.number(),
        }),
        response: {
          200: z.array(Cell),
        },
      },
    },
    async (request) => {
      const { btc_txid, vout } = request.params;
      const args = buildRgbppLockArgs(vout, btc_txid);
      const lockScript = genRgbppLockScript(args, process.env.NETWORK === 'mainnet');

      const collector = fastify.ckb.indexer.collector({
        lock: lockScript,
      });

      const collect = collector.collect();
      const cells: Cell[] = [];
      for await (const cell of collect) {
        cells.push(cell);
      }
      return cells;
    },
  );

  done();
};

export default assetsRoute;
