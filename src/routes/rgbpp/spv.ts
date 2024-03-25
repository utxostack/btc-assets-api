import { FastifyPluginCallback } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import { Server } from 'http';
import z from 'zod';
import { TxProof } from '../../services/spv';
import { CUSTOM_HEADERS } from '../../constants';

const spvRoute: FastifyPluginCallback<Record<never, never>, Server, ZodTypeProvider> = (fastify, _, done) => {
  fastify.get(
    '/proof',
    {
      schema: {
        description: 'Get proof of a Bitcoin transaction from SPV service',
        tags: ['RGB++'],
        querystring: z.object({
          txid: z.string().describe('The Bitcoin transaction id'),
          index: z.coerce.number().describe('The output index'),
          confirmations: z.coerce.number().describe('The number of confirmations'),
        }),
        response: {
          200: TxProof,
        },
      },
    },
    async (request, reply) => {
      const { txid, index, confirmations } = request.query;
      const proof = await fastify.bitcoinSPV.getTxProof(txid, index, confirmations);
      reply.header(CUSTOM_HEADERS.ResponseCacheable, 'true');
      return proof;
    },
  );

  done();
};

export default spvRoute;
