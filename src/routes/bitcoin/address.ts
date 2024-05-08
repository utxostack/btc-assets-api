import { FastifyPluginCallback } from 'fastify';
import { Server } from 'http';
import { Balance, Transaction, UTXO } from './types';
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
        description: 'Get the balance of a bitcoin address',
        tags: ['Bitcoin'],
        params: z.object({
          address: z.string().describe('The Bitcoin address'),
        }),
        querystring: z.object({
          min_satoshi: z.coerce.number().optional().describe('The minimum value of the UTXO in satoshi'),
        }),
        response: {
          200: Balance,
        },
      },
    },
    async (request) => {
      const { address } = request.params;
      const { min_satoshi } = request.query;
      const utxos = await fastify.bitcoin.getAddressTxsUtxo({ address });
      return utxos.reduce(
        (acc: Balance, utxo: UTXO) => {
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
        }),
        response: {
          200: z.array(UTXO),
        },
      },
    },
    async function (request) {
      const { address } = request.params;
      const { only_confirmed, min_satoshi } = request.query;
      let utxos = await fastify.bitcoin.getAddressTxsUtxo({ address });

      // compatible with the case where only_confirmed is undefined
      if (only_confirmed === 'true' || only_confirmed === 'undefined') {
        utxos = utxos.filter((utxo) => utxo.status.confirmed);
      }
      if (min_satoshi) {
        utxos = utxos.filter((utxo) => utxo.value >= min_satoshi);
      }
      return utxos;
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
