import { Type, TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import { FastifyPluginCallback } from 'fastify';
import { Server } from 'http';

const transactionRoutes: FastifyPluginCallback<
  Record<never, never>,
  Server,
  TypeBoxTypeProvider
> = (fastify, _, done) => {
  fastify.post(
    '/',
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
  done();
};

export default transactionRoutes;
