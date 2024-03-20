import { FastifyPluginCallback } from 'fastify';
import { Server } from 'http';
import { Balance, BalanceType, Transaction, UTXO, UTXOType } from './types';
import validateBitcoinAddress from '../../utils/validators';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import z from 'zod';

const addressRoutes: FastifyPluginCallback<Record<never, never>, Server, ZodTypeProvider> = (fastify, _, done) => {
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
        params: z.object({
          address: z.string(),
        }),
        querystring: z.object({
          min_satoshi: z.coerce.number().optional(),
        }),
        response: {
          200: Balance,
        },
      },
    },
    async (request) => {
      const { address } = request.params;
      const { min_satoshi } = request.query;
      const utxos = await fastify.electrs.getUtxoByAddress(address);
      return utxos.reduce(
        (acc: BalanceType, utxo: UTXOType) => {
          if (utxo.status.confirmed) {
            if (min_satoshi && utxo.value < min_satoshi) {
              acc.dust_satoshi += utxo.value;
            } else {
              acc.satoshi += utxo.value;
            }
            return acc;
          }
          acc.pending_satoshi += utxo.value;
          return acc;
        },
        {
          address,
          satoshi: 0,
          pending_satoshi: 0,
          dust_satoshi: 0,
          utxo_count: utxos.length,
        },
      );
    },
  );

  fastify.get(
    '/:address/unspent',
    {
      schema: {
        params: z.object({
          address: z.string(),
        }),
        querystring: z.object({
          min_satoshi: z.coerce.number().optional(),
        }),
        response: {
          200: z.array(UTXO),
        },
      },
    },
    async function (request) {
      const { address } = request.params;
      const { min_satoshi } = request.query;
      const utxos = await fastify.electrs.getUtxoByAddress(address);
      if (min_satoshi) {
        return utxos.filter((utxo) => utxo.value >= min_satoshi);
      }
      return utxos;
    },
  );

  fastify.get(
    '/:address/txs',
    {
      schema: {
        params: z.object({
          address: z.string(),
        }),
        response: {
          200: z.array(Transaction),
        },
      },
    },
    async (request) => {
      const { address } = request.params;
      const txs = await fastify.electrs.getTransactionsByAddress(address);
      return txs;
    },
  );

  done();
};

export default addressRoutes;
