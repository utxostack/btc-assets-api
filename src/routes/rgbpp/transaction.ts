import { FastifyPluginCallback } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import { Server } from 'http';
import z from 'zod';

const transactionRoute: FastifyPluginCallback<Record<never, never>, Server, ZodTypeProvider> = (fastify, _, done) => {
  fastify.post(
    '/ckb-tx',
    {
      schema: {
        body: z.object({
          txid: z.string(),
          ckbTx: z.object({}),
        }),
      },
    },
    async (request, reply) => {
      const { txid, ckbTx } = request.body;
      const job = await fastify.transactionQueue.add(txid, ckbTx);
      reply.send({ job });
    },
  );

  fastify.get(
    '/:txid',
    {
      schema: {
        params: z.object({
          txid: z.string(),
        }),
      },
    },
    async (request, reply) => {
      const { txid } = request.params;
      const job = await fastify.transactionQueue.getJob(txid);
      // TODO: get ckb tx hash from job return value, and query ckb node for tx status
      reply.send({ job });
    },
  );

  done();
};

export default transactionRoute;
