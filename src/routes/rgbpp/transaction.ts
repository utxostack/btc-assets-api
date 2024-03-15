import { FastifyPluginCallback } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import { Server } from 'http';
import z from 'zod';
import { CKBVirtualResult } from './types';
import { Job } from 'bullmq';

const transactionRoute: FastifyPluginCallback<Record<never, never>, Server, ZodTypeProvider> = (fastify, _, done) => {
  fastify.post(
    '/ckb-tx',
    {
      schema: {
        body: z.object({
          txid: z.string(),
          ckbVirtualResult: CKBVirtualResult,
        }),
        response: {
          200: z.object({
            state: z.string(),
          }),
        },
      },
    },
    async (request, reply) => {
      const { txid, ckbVirtualResult } = request.body;
      const job: Job = await fastify.transactionManager.enqueueTransaction({ txid, ckbVirtualResult });
      const state = await job.getState();
      reply.send({ state });
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
            state: z.string(),
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
      const state = await job.getState();
      return { hash, state };
    },
  );

  done();
};

export default transactionRoute;
