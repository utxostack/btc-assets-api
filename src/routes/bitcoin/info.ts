import { Type, TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import { FastifyPluginCallback } from 'fastify';
import { Server } from 'http';

const infoRoute: FastifyPluginCallback<Record<never, never>, Server, TypeBoxTypeProvider> = (
  fastify,
  _,
  done,
) => {
  fastify.get(
    '/info',
    {
      schema: {
        response: {
          200: Type.Object({
            chain: Type.String(),
            blocks: Type.Number(),
            headers: Type.Number(),
            bestblockhash: Type.String(),
            difficulty: Type.Number(),
            mediantime: Type.Number(),
          }),
        },
      },
    },
    async function () {
      const blockchainInfo = await fastify.bitcoind.getBlockchainInfo();
      return blockchainInfo;
    },
  );
  done();
};

export default infoRoute;
