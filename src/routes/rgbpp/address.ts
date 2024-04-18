import { FastifyPluginCallback } from 'fastify';
import { Server } from 'http';
import validateBitcoinAddress from '../../utils/validators';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import { Cell, Script } from './types';
import { buildRgbppLockArgs, genRgbppLockScript } from '@rgbpp-sdk/ckb/lib/utils/rgbpp';
import { CKBIndexerQueryOptions } from '@ckb-lumos/ckb-indexer/lib/type';
import { blockchain } from '@ckb-lumos/base';
import z from 'zod';

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
        description: 'Get RGB++ assets by btc address',
        tags: ['RGB++'],
        params: z.object({
          btc_address: z.string(),
        }),
        querystring: z.object({
          type_script: Script.or(z.string())
            .optional()
            .describe(
              `
              type script to filter cells

              two ways to provide:
              - as a object: 'encodeURIComponent(JSON.stringify({"codeHash":"0x...", "args":"0x...", "hashType":"type"}))'
              - as a hex string: '0x...' (You can pack by @ckb-lumos/codec blockchain.Script.pack({ "codeHash": "0x...", ... }))
            `,
            ),
        }),
        response: {
          200: z.array(Cell),
        },
      },
    },
    async (request) => {
      const { btc_address } = request.params;
      const { type_script } = request.query;
      const utxos = await fastify.electrs.getUtxoByAddress(btc_address);
      const cells = await Promise.all(
        utxos.map(async (utxo) => {
          const { txid, vout } = utxo;
          const args = buildRgbppLockArgs(vout, txid);

          const query: CKBIndexerQueryOptions = {
            lock: genRgbppLockScript(args, process.env.NETWORK === 'mainnet'),
          };

          if (type_script) {
            if (typeof type_script === 'string') {
              query.type = blockchain.Script.unpack(type_script);
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
