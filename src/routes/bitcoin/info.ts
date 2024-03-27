import { FastifyPluginCallback } from 'fastify';
import { Server } from 'http';
import { ChainInfo } from './types';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import { BitcoinRPCError } from '../../services/bitcoind';

const infoRoute: FastifyPluginCallback<Record<never, never>, Server, ZodTypeProvider> = (fastify, _, done) => {
  fastify.get(
    '/info',
    {
      schema: {
        description: 'Get information about the Bitcoin blockchain',
        tags: ['Bitcoin'],
        response: {
          200: ChainInfo,
          500: BitcoinRPCError.schema,
        },
      },
    },
    async (_, reply) => {
      try {
        const blockchainInfo = await fastify.bitcoind.getBlockchainInfo();
        return blockchainInfo;
      } catch (err) {
        if (err instanceof BitcoinRPCError) {
          reply.status(err.statusCode);
          return {
            code: err.errorCode,
            message: err.message,
          };
        }
      }
    },
  );
  done();
};

export default infoRoute;
