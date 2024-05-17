import { FastifyPluginCallback } from 'fastify';
import { Server } from 'http';
import validateBitcoinAddress from '../../utils/validators';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import { Cell, Script } from './types';
import { blockchain } from '@ckb-lumos/base';
import z from 'zod';
import { serializeScript } from '@nervosnetwork/ckb-sdk-utils';
import { Env } from '../../env';

const addressRoutes: FastifyPluginCallback<Record<never, never>, Server, ZodTypeProvider> = (fastify, _, done) => {
  const env: Env = fastify.container.resolve('env');

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
          no_cache: z
            .enum(['true', 'false'])
            .default('false')
            .describe('Whether to disable cache to get RGB++ assets, default is false'),
        }),
        response: {
          200: z.array(Cell),
        },
      },
    },
    async (request) => {
      const { btc_address } = request.params;
      const { type_script, no_cache } = request.query;

      let typeScript: Script | undefined = undefined;
      if (type_script) {
        if (typeof type_script === 'string') {
          typeScript = blockchain.Script.unpack(type_script);
        } else {
          typeScript = type_script;
        }
      }

      let utxosCache = null;
      if (env.UTXO_SYNC_DATA_CACHE_ENABLE && no_cache !== 'true') {
        utxosCache = await fastify.utxoSyncer.getUTXOsFromCache(btc_address);
        await fastify.utxoSyncer.enqueueSyncJob(btc_address);
      }
      const utxos = utxosCache ? utxosCache : await fastify.bitcoin.getAddressTxsUtxo({ address: btc_address });

      let rgbppCache = null;
      if (env.RGBPP_COLLECT_DATA_CACHE_ENABLE && no_cache !== 'true') {
        rgbppCache = await fastify.rgbppCollector.getRgbppCellsFromCache(btc_address);
        await fastify.rgbppCollector.enqueueCollectJob(btc_address, utxos);
      }

      if (rgbppCache) {
        fastify.log.debug(`[RGB++] get cells from cache: ${btc_address}`);
        if (typeScript) {
          return rgbppCache.filter((cell) => serializeScript(cell.cellOutput.type!) === serializeScript(typeScript!));
        }
        return rgbppCache;
      }

      const rgbppUtxoCellsParis = await fastify.rgbppCollector.collectRgbppUtxoCellsPairs(utxos, typeScript);
      const cells = rgbppUtxoCellsParis.map((pair) => pair.cells).flat();
      return cells;
    },
  );

  done();
};

export default addressRoutes;
