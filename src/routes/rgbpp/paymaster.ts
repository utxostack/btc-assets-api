import { HttpStatusCode } from 'axios';
import { FastifyPluginCallback } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import { Server } from 'http';
import z from 'zod';

const paymasterRoutes: FastifyPluginCallback<Record<never, never>, Server, ZodTypeProvider> = (fastify, _, done) => {
  fastify.get(
    '/info',
    {
      schema: {
        description: 'Get RGB++ paymaster information',
        tags: ['RGB++'],
        response: {
          200: z.object({
            btc_address: z.string().describe('Bitcoin address to send funds to'),
            ckb_address: z.string().describe('CKB address to pay cell capacity to'),
            fee: z.coerce.number().describe('Container fee in satoshis'),
          }),
        },
      },
    },
    async (_, reply) => {
      const btc_address = fastify.paymaster.btcAddress;
      if (!btc_address) {
        reply.status(HttpStatusCode.NotFound);
        return;
      }

      const ckb_address = fastify.paymaster.ckbAddress;
      const fee = fastify.paymaster.containerFee;
      return { btc_address, ckb_address, fee };
    },
  );
  done();
};

export default paymasterRoutes;
