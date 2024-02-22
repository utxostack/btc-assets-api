import { Type, TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import { FastifyPluginCallback } from 'fastify';
import { Server } from 'http';

const balanceRoute: FastifyPluginCallback<Record<never, never>, Server, TypeBoxTypeProvider> = (
  fastify,
  _,
  done,
) => {
  fastify.get(
    '/balance',
    {
      schema: {
        params: Type.Object({
          address: Type.String(),
        }),
        response: {
          200: Type.Object({
            address: Type.String(),
            satoshi: Type.Number(),
            pendingSatoshi: Type.Number(),
            utxoCount: Type.Number(),
          }),
        },
      },
    },
    async (request) => {
      const { address } = request.params;
      const satoshis = await fastify.electrs.getBalanceByAddress(address);
      return satoshis;
    },
  );
  done();
};

export default balanceRoute;
