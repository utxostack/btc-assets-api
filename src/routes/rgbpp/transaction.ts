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
        description: 'Submit a RGB++ CKB transaction',
        tags: ['RGB++'],
        body: z.object({
          txid: z.string(),
          ckbVirtualResult: CKBVirtualResult,
        }),
        response: {
          200: z.object({
            state: z.string().describe('The state of the transaction, waiting by default'),
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
    '/:btc_txid',
    {
      schema: {
        description: `
          Get RGB++ CKB transaction by btc txid

          * completed: The CKB transaction has been sent and confirmed.
          * failed: Something went wrong during the process, and it has failed.
          * delayed: The transaction has not been confirmed yet and is waiting for confirmation.
          * active: The transaction is currently being processed.
          * waiting: The transaction is pending and is waiting to be processed.
        `,
        tags: ['RGB++'],
        params: z.object({
          btc_txid: z.string(),
        }),
        response: {
          200: z.object({
            ckbTxHash: z.string().or(z.null()).describe('The CKB transaction hash'),
            state: z.string().describe('The state of the transaction'),
          }),
        },
      },
    },
    async (request, reply) => {
      const { btc_txid } = request.params;
      const job = await fastify.transactionManager.getTransactionRequest(btc_txid);
      if (!job) {
        reply.status(404);
        return;
      }
      console.log(job);
      const ckbTxHash = job.returnvalue;
      const state = await job.getState();
      return { ckbTxHash, state };
    },
  );

  done();
};

export default transactionRoute;
