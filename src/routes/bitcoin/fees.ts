import { FastifyPluginCallback } from 'fastify';
import { Server } from 'http';
import { RecommendedFees } from './types';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import { CUSTOM_HEADERS } from '../../constants';

const feesRoutes: FastifyPluginCallback<Record<never, never>, Server, ZodTypeProvider> = (fastify, _, done) => {
  fastify.get(
    '/recommended',
    {
      schema: {
        description: 'Get recommended fees for Bitcoin transactions',
        tags: ['Bitcoin'],
        response: {
          200: RecommendedFees,
        },
      },
    },
    async (_, reply) => {
      const fees = await fastify.bitcoin.getFeesRecommended();
      reply.header(CUSTOM_HEADERS.ResponseCacheable, 'true');
      reply.header(CUSTOM_HEADERS.ResponseCacheMaxAge, 10);
      return fees;
    },
  );
  done();
};

export default feesRoutes;
