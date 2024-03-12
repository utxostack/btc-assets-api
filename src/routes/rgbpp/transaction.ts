import { FastifyPluginCallback } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import { Server } from 'http';
import z from 'zod';
import { CKBTransaction, CKBVirtualResult } from './types';

const transactionRoute: FastifyPluginCallback<Record<never, never>, Server, ZodTypeProvider> = (fastify, _, done) => {
  fastify.post(
    '/ckb-tx',
    {
      schema: {
        body: z.object({
          txid: z.string(),
          ckbVirtualResult: CKBVirtualResult,
        }),
      },
    },
    async (request, reply) => {
      const { txid, ckbVirtualResult } = request.body;
      const job = await fastify.transactionManager.enqueueTransaction({ txid, ckbVirtualResult });
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
        response: {
          200: z.object({
            hash: z.string(),
            transaction: CKBTransaction,
            status: z.string(),
          }),
        },
      },
    },
    async (request, reply) => {
      const { txid } = request.params;
      const job = await fastify.transactionManager.getTransactionRequest(txid);
      if (!job) {
        reply.status(404);
        return;
      }
      const hash = job.returnvalue;
      const tx = await fastify.ckbRPC.getTransaction(hash);
      console.log(tx);
      const { transaction } = tx;
      const status = await job.getState();
      return { hash, status, transaction };
    },
  );

  done();
};

export default transactionRoute;
