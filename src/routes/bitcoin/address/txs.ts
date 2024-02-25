import { Type, TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import { FastifyPluginCallback } from 'fastify';
import { Server } from 'http';
import { Transaction } from '../types';

const transactionsRoute: FastifyPluginCallback<Record<never, never>, Server, TypeBoxTypeProvider> = (
  fastify,
  _,
  done,
) => {
  fastify.get(
    '/txs',
    {
      schema: {
        params: Type.Object({
          address: Type.String(),
        }),
        response: {
          200: Type.Array(Transaction),
        }
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

export default transactionsRoute;
