import { Type, TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import { FastifyPluginCallback } from 'fastify';
import { Server } from 'http';
import { Transaction } from './types';

const transactionRoutes: FastifyPluginCallback<
  Record<never, never>,
  Server,
  TypeBoxTypeProvider
> = (fastify, _, done) => {
  fastify.post(
    '',
    {
      schema: {
        body: Type.Object({
          txHex: Type.String(),
        }),
        response: {
          200: Type.String(),
        },
      },
    },
    async (request) => {
      const { txHex } = request.body;
      const txid = await fastify.bitcoind.sendRawTransaction(txHex);
      return txid;
    },
  );

  fastify.get(
    '/:txid',
    {
      schema: {
        params: Type.Object({
          txid: Type.String(),
        }),
        response: {
          200: Transaction,
        },
      },
    },
    async (request, reply) => {
      const { txid } = request.params;
      const transaction = await fastify.electrs.getTransaction(txid);
      console.log(transaction);
      if (transaction.status.confirmed) {
        reply.header('x-block-confirmed', 'true');
      }
      return transaction;
    },
  );
  done();
};

export default transactionRoutes;
