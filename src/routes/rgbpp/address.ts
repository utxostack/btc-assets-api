import { FastifyPluginCallback } from 'fastify';
import { Server } from 'http';
import validateBitcoinAddress from '../../utils/validators';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import { Cell, Script } from './types';
import { append0x, u32ToLe } from '../../utils/hex';
import { genRgbppLockScript } from '@rgbpp-sdk/ckb/lib/utils/rgbpp';
import { CKBIndexerQueryOptions } from '@ckb-lumos/ckb-indexer/lib/type';
import z from 'zod';
import { TypeScript } from './utils';

const addressRoutes: FastifyPluginCallback<Record<never, never>, Server, ZodTypeProvider> = (fastify, _, done) => {
  fastify.addHook('preHandler', async (request) => {
    const { btc_address } = request.params as { btc_address: string };
    const valid = validateBitcoinAddress(btc_address);
    if (!valid) {
      throw fastify.httpErrors.badRequest('Invalid bitcoin address');
    }
  });

  fastify.get(
    '/:btc_address/assets',
    {
      schema: {
        params: z.object({
          address: z.string(),
        }),
        querystring: z.object({
          type_script: Script.or(z.string()).optional(),
        }),
        response: {
          200: z.array(Cell),
        },
      },
    },
    async (request) => {
      const { address } = request.params;
      const { type_script } = request.query;
      const utxos = await fastify.electrs.getUtxoByAddress(address);
      const cells = await Promise.all(
        utxos.map(async (utxo) => {
          const { txid, vout } = utxo;
          const args = append0x(`${u32ToLe(vout)}${txid}`);

          const query: CKBIndexerQueryOptions = {
            lock: genRgbppLockScript(args, process.env.NETWORK === 'mainnet'),
          };

          if (type_script) {
            if (typeof type_script === 'string') {
              query.type = TypeScript.unpack(type_script) as Script;
            } else {
              query.type = type_script;
            }
          }

          const collector = fastify.ckbIndexer.collector(query).collect();
          const cells: Cell[] = [];
          for await (const cell of collector) {
            cells.push(cell);
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
