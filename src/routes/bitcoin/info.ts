import { FastifyPluginCallback } from 'fastify';
import { Server } from 'http';
import { ChainInfo } from './types';
import { ZodTypeProvider } from 'fastify-type-provider-zod';

const infoRoute: FastifyPluginCallback<Record<never, never>, Server, ZodTypeProvider> = (fastify, _, done) => {
  fastify.get(
    '/info',
    {
      schema: {
        description: 'Get information about the Bitcoin blockchain',
        tags: ['Bitcoin'],
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
