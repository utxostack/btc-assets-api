import { FastifyPluginCallback } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import { BitcoinSPVError, TxProof } from '../../services/spv';
import { CUSTOM_HEADERS } from '../../constants';
import { HttpStatusCode } from 'axios';
import { Server } from 'http';
import z from 'zod';

const spvRoute: FastifyPluginCallback<Record<never, never>, Server, ZodTypeProvider> = (fastify, _, done) => {
  fastify.get(
    '/proof',
    {
      schema: {
        description: 'Get proof of a Bitcoin transaction from SPV service',
        tags: ['RGB++'],
        querystring: z.object({
          txid: z.string().describe('The Bitcoin transaction id'),
          confirmations: z.coerce.number().describe('The number of confirmations'),
        }),
        response: {
          200: TxProof,
          503: BitcoinSPVError.schema,
        },
      },
    },
    async (request, reply) => {
      try {
        const { txid, confirmations } = request.query;
        const proof = await fastify.bitcoinSPV.getTxProof(txid, confirmations);
        if (proof) {
          reply.header(CUSTOM_HEADERS.ResponseCacheable, 'true');
        }
        return proof;
      } catch (err) {
        if (err instanceof BitcoinSPVError) {
          reply.status(HttpStatusCode.ServiceUnavailable);
          reply.header('Retry-After', '600000');
          return {
            code: err.code,
            message: err.message,
          };
        }
        throw err;
      }
    },
  );

  done();
};

export default spvRoute;
