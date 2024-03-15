import { FastifyPluginCallback } from 'fastify';
import { Server } from 'http';
import validateBitcoinAddress from '../../utils/validators';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import z from 'zod';
import { OutputCell } from './types';
import { append0x, u32ToLe } from '../../utils/hex';
import { genRgbppLockScript } from '@rgbpp-sdk/ckb/lib/utils/rgbpp';

const addressRoutes: FastifyPluginCallback<Record<never, never>, Server, ZodTypeProvider> = (fastify, _, done) => {
  fastify.addHook('preHandler', async (request) => {
    const { address } = request.params as { address: string };
    const valid = validateBitcoinAddress(address);
    if (!valid) {
      throw fastify.httpErrors.badRequest('Invalid bitcoin address');
    }
  });

  fastify.get(
    '/:address/assets',
    {
      schema: {
        params: z.object({
          address: z.string(),
        }),
        response: {
          200: z.array(OutputCell),
        },
      },
    },
    async (request) => {
      const { address } = request.params;
      const utxos = await fastify.electrs.getUtxoByAddress(address);
      const cells = await Promise.all(
        utxos.map(async (utxo) => {
          const { txid, vout } = utxo;
          const args = append0x(`${u32ToLe(vout)}${txid}`);
          const lockScript = genRgbppLockScript(args, process.env.NETWORK === 'mainnet');
          const collector = fastify.ckbIndexer.collector({
            lock: lockScript,
          });
          const collect = collector.collect();
          const cells: OutputCell[] = [];
          for await (const cell of collect) {
            cells.push(cell as unknown as OutputCell);
          }
          return cells;
        }),
      );
      return cells.flat();
    },
  );

  done();
};

export default addressRoutes;
