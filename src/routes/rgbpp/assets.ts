import { FastifyPluginCallback } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import { Server } from 'http';
import z from 'zod';
import { genRgbppLockScript } from '@rgbpp-sdk/ckb/lib/utils/rgbpp';
import { append0x, u32ToLe } from '../../utils/hex';
import { Cell } from './types';

const assetsRoute: FastifyPluginCallback<Record<never, never>, Server, ZodTypeProvider> = (fastify, _, done) => {
  fastify.get(
    '/:txid/:vout',
    {
      schema: {
        params: z.object({
          txid: z.string(),
          vout: z.coerce.number(),
        }),
        response: {
          200: z.array(Cell),
        },
      },
    },
    async (request) => {
      const { txid, vout } = request.params;
      const args = append0x(`${u32ToLe(vout)}${txid}`);
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
