import { FastifyPluginCallback } from 'fastify';
import { Server } from 'http';
import { Balance, Transaction, UTXO } from './types';
import validateBitcoinAddress from '../../utils/validators';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import z from 'zod';
import { Env } from '../../env';

const addressRoutes: FastifyPluginCallback<Record<never, never>, Server, ZodTypeProvider> = (fastify, _, done) => {
  const env: Env = fastify.container.resolve('env');

  fastify.addHook('preHandler', async (request) => {
    const { address } = request.params as { address: string };
    const valid = validateBitcoinAddress(address);
    if (!valid) {
      throw fastify.httpErrors.badRequest('Invalid bitcoin address');
    }
  });

  fastify.get(
    '/:address/balance',
    {
      schema: {
        description: 'Get the balance of a bitcoin address',
        tags: ['Bitcoin'],
        params: z.object({
          address: z.string().describe('The Bitcoin address'),
        }),
        querystring: z.object({
          min_satoshi: z.coerce.number().optional().describe('The minimum value of the UTXO in satoshi'),
          no_cache: z
            .enum(['true', 'false'])
            .default('false')
            .describe('Whether to disable cache to get utxos, default is false'),
        }),
        response: {
          200: Balance,
        },
      },
    },
    async (request) => {
      const { address } = request.params;
      const { min_satoshi, no_cache } = request.query;

      const utxos = await fastify.utxoSyncer.getUtxosByAddress(address, no_cache === 'true');
      if (env.UTXO_SYNC_DATA_CACHE_ENABLE) {
        await fastify.utxoSyncer.enqueueSyncJob(address);
      }

      const rgbppUtxoCellsPairs = await fastify.rgbppCollector.getRgbppUtxoCellsPairs(
        address,
        utxos,
        no_cache === 'true',
      );
      if (env.RGBPP_COLLECT_DATA_CACHE_ENABLE) {
        await fastify.rgbppCollector.enqueueCollectJob(address, utxos);
      }

      const rgbppUtxoMap = rgbppUtxoCellsPairs.reduce((map, { utxo }) => {
        map.set(utxo.txid + ':' + utxo.vout, utxo);
        return map;
      }, new Map<string, UTXO>());

      const balance: Balance = {
        address,
        total_satoshi: 0,
        satoshi: 0,
        available_satoshi: 0,
        pending_satoshi: 0,
        dust_satoshi: 0,
        rgbpp_satoshi: 0,
        utxo_count: utxos.length,
      };

      for (const utxo of utxos) {
        const isDustUTXO = min_satoshi !== undefined && utxo.value < min_satoshi;
        const isRgbppBound = rgbppUtxoMap.has(utxo.txid + ':' + utxo.vout);

        balance.total_satoshi += utxo.value;
        if (utxo.status.confirmed) {
          if (!isDustUTXO && !isRgbppBound) {
            balance.available_satoshi += utxo.value;
          }
          if (isDustUTXO) {
            balance.dust_satoshi += utxo.value;
          }
          if (isRgbppBound) {
            balance.rgbpp_satoshi += utxo.value;
          }
        } else {
          balance.pending_satoshi += utxo.value;
        }
      }
      // @deprecated for compatibility
      balance.satoshi = balance.available_satoshi;
      return balance;
    },
  );

  fastify.get(
    '/:address/unspent',
    {
      schema: {
        tags: ['Bitcoin'],
        description: 'Get the unspent transaction outputs (UTXOs) of a bitcoin address',
        params: z.object({
          address: z.string().describe('The Bitcoin address'),
        }),
        querystring: z.object({
          only_confirmed: z
            .enum(['true', 'false', 'undefined'])
            .default('true')
            .describe('Only return confirmed UTXOs'),
          min_satoshi: z.coerce.number().optional().describe('The minimum value of the UTXO in satoshi'),
          only_non_rgbpp_utxos: z
            .enum(['true', 'false', 'undefined'])
            .default('false')
            .describe('Only return non-RGBPP UTXOs'),
          no_cache: z
            .enum(['true', 'false'])
            .default('false')
            .describe('Whether to disable cache to get utxos, default is false'),
        }),
        response: {
          200: z.array(UTXO),
        },
      },
    },
    async function (request) {
      const { address } = request.params;
      const { only_confirmed, min_satoshi, only_non_rgbpp_utxos, no_cache } = request.query;

      const utxos = await fastify.utxoSyncer.getUtxosByAddress(address, no_cache === 'true');
      if (env.UTXO_SYNC_DATA_CACHE_ENABLE) {
        await fastify.utxoSyncer.enqueueSyncJob(address);
      }

      const rgbppUtxoCellsPairs =
        only_non_rgbpp_utxos === 'true'
          ? await fastify.rgbppCollector.getRgbppUtxoCellsPairs(address, utxos, no_cache === 'true')
          : [];
      if (env.RGBPP_COLLECT_DATA_CACHE_ENABLE) {
        await fastify.rgbppCollector.enqueueCollectJob(address, utxos);
      }
      const rgbppUtxoSet = new Set(rgbppUtxoCellsPairs.map((pair) => pair.utxo.txid + ':' + pair.utxo.vout));

      return utxos.filter((utxo) => {
        if (only_confirmed === 'true') {
          return utxo.status.confirmed;
        }
        if (min_satoshi !== undefined) {
          return utxo.value >= min_satoshi;
        }
        if (only_non_rgbpp_utxos === 'true') {
          return !rgbppUtxoSet.has(utxo.txid + ':' + utxo.vout);
        }
        return true;
      });
    },
  );

  fastify.get(
    '/:address/txs',
    {
      schema: {
        description: 'Get the transactions of a bitcoin address',
        tags: ['Bitcoin'],
        params: z.object({
          address: z.string().describe('The Bitcoin address'),
        }),
        querystring: z.object({
          after_txid: z.string().optional().describe('The txid of the transaction to start after'),
        }),
        response: {
          200: z.array(Transaction),
        },
      },
    },
    async (request) => {
      const { address } = request.params;
      const { after_txid } = request.query;
      const txs = await fastify.bitcoin.getAddressTxs({ address, after_txid });
      return txs;
    },
  );

  done();
};

export default addressRoutes;
