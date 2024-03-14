import { FastifyPluginCallback } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import { Server } from 'http';
import z from 'zod';
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-expect-error
import { getRgbppLockScript } from '@rgbpp-sdk/ckb';
import { append0x, u32ToLe } from '../../utils/hex';

const assetsRoute: FastifyPluginCallback<Record<never, never>, Server, ZodTypeProvider> = (fastify, _, done) => {
  fastify.get(
    '/:txid/:vout',
    {
      schema: {
        params: z.object({
          txid: z.string(),
          vout: z.coerce.number(),
        }),
      },
    },
    async (request, reply) => {
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
      const cell = await collect[Symbol.asyncIterator]().next();
      if (cell.done) {
        reply.status(404);
        return { message: 'Cell not found' };
      }
      return cell;
    },
  );

  done();
};

export default assetsRoute;
