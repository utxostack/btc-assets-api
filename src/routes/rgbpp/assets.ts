import { FastifyPluginCallback } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import { Server } from 'http';
import z from 'zod';
import { genRgbppLockScript } from '@rgbpp-sdk/ckb/lib/utils/rgbpp';
import { append0x, u32ToLe } from '../../utils/hex';
import { Cell } from './types';

const assetsRoute: FastifyPluginCallback<Record<never, never>, Server, ZodTypeProvider> = (fastify, _, done) => {
  fastify.get(
    '/:btc_txid/:vout',
    {
      schema: {
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
      const args = append0x(`${u32ToLe(vout)}${btc_txid}`);
      const lockScript = genRgbppLockScript(args, process.env.NETWORK === 'mainnet');

      const collector = fastify.ckbIndexer.collector({
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
