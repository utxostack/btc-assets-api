import { FastifyPluginCallback } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import { Server } from 'http';
import z from 'zod';
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-expect-error
import { getRgbppLockScript } from '@rgbpp-sdk/ckb';
import { append0x, u32ToLe } from '../../utils/hex';
import { OutputCell } from './types';

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
          200: z.array(OutputCell),
        },
      },
    },
    async (request) => {
      const { txid, vout } = request.params;
      const lockScript = getRgbppLockScript(process.env.NETWORK === 'mainnet');
      const args = append0x(`${u32ToLe(vout)}${txid}`);

      const collector = fastify.ckbIndexer.collector({
        lock: {
          ...lockScript,
          args,
        },
      });

      const collect = collector.collect();
      const cells: OutputCell[] = [];
      for await (const cell of collect) {
        cells.push(cell as unknown as OutputCell);
      }
      return cells;
    },
  );

  done();
};

export default assetsRoute;
