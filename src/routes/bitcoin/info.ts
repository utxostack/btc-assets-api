import { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import { FastifyPluginCallback } from 'fastify';
import { Server } from 'http';
import { ChainInfo } from './types';

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
          200: ChainInfo,
        },
      },
    },
    async () => {
      const blockchainInfo = await fastify.bitcoind.getBlockchainInfo();
      return blockchainInfo;
    },
  );
  done();
};

export default infoRoute;
