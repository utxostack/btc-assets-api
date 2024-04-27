import { FastifyPluginCallback } from 'fastify';
import { Server } from 'http';
import { Transaction } from './types';
import { CUSTOM_HEADERS } from '../../constants';
import z from 'zod';
import { ZodTypeProvider } from 'fastify-type-provider-zod';

const transactionRoutes: FastifyPluginCallback<Record<never, never>, Server, ZodTypeProvider> = (fastify, _, done) => {
  fastify.post(
    '',
    {
      schema: {
        description: 'Send a raw transaction to the Bitcoin network',
        tags: ['Bitcoin'],
        body: z.object({
          txhex: z.string().describe('The raw transaction hex'),
        }),
        response: {
          200: z.object({
            txid: z.string(),
          }),
        },
      },
    },
    async (request) => {
      const { txhex } = request.body;
      const txid = await fastify.bitcoin.postTx({ txhex });
      return {
        txid,
      };
    },
  );

  fastify.get(
    '/:txid',
    {
      schema: {
        description: 'Get a transaction by its txid',
        tags: ['Bitcoin'],
        params: z.object({
          txid: z.string().describe('The Bitcoin transaction id'),
        }),
        response: {
          200: Transaction,
        },
      },
    },
    async (request, reply) => {
      const { txid } = request.params;
      const transaction = await fastify.bitcoin.getTx({ txid });
      if (transaction.status.confirmed) {
        reply.header(CUSTOM_HEADERS.ResponseCacheable, 'true');
      }
      return transaction;
    },
  );
  done();
};

export default transactionRoutes;
