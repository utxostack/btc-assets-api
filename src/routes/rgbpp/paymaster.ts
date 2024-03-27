import { FastifyPluginCallback } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import { Server } from 'http';
import z from 'zod';

const paymasterRoutes: FastifyPluginCallback<Record<never, never>, Server, ZodTypeProvider> = (fastify, _, done) => {
  fastify.get(
    '/btc_address',
    {
      schema: {
        description: 'Get RGB++ paymaster btc address',
        tags: ['RGB++'],
        response: {
          200: z.object({
            btc_address: z.string(),
          }),
        },
      },
    },
    async () => {
      const btcAddress = fastify.paymaster.btcAddress;
      return { btc_address: btcAddress };
    },
  );

  fastify.get(
    '/container_fee',
    {
      schema: {
        description: 'Get RGB++ paymaster container fee in sats',
        tags: ['RGB++'],
        response: {
          200: z.object({
            fee: z.coerce.number(),
          }),
        },
      },
    },
    async () => {
      const fee = fastify.paymaster.containerFee;
      return { fee };
    },
  )

  done();
};

export default paymasterRoutes;
