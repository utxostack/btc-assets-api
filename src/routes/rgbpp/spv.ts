import { FastifyPluginCallback } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import { BitcoinSPVError, TxProof } from '../../services/spv';
import { CUSTOM_HEADERS } from '../../constants';
import { HttpStatusCode } from 'axios';
import { Server } from 'http';
import z from 'zod';

export const SPV_PROOF_CACHE_MAX_AGE = 60;

const spvRoute: FastifyPluginCallback<Record<never, never>, Server, ZodTypeProvider> = (fastify, _, done) => {
  fastify.get(
    '/proof',
    {
      schema: {
        description: 'Get proof of a Bitcoin transaction from SPV service',
        tags: ['RGB++'],
        querystring: z.object({
          btc_txid: z.string().describe('The Bitcoin transaction id'),
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
        const { btc_txid, confirmations } = request.query;
        const proof = await fastify.bitcoinSPV.getTxProof(btc_txid, confirmations);
        if (proof) {
          reply.header(CUSTOM_HEADERS.ResponseCacheable, 'true');
          reply.header(CUSTOM_HEADERS.ResponseCacheMaxAge, SPV_PROOF_CACHE_MAX_AGE);
        }
        return proof;
      } catch (err) {
        if (err instanceof BitcoinSPVError) {
          reply.status(HttpStatusCode.ServiceUnavailable);
          reply.header('Retry-After', (SPV_PROOF_CACHE_MAX_AGE * 1000).toString());
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
