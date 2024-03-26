import { FastifyPluginCallback } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import { Server } from 'http';
import z from 'zod';
import { CKBVirtualResult } from './types';
import { Job } from 'bullmq';
import { buildRgbppLockArgs, genRgbppLockScript } from '@rgbpp-sdk/ckb';
import { CKBIndexerQueryOptions } from '@ckb-lumos/ckb-indexer/lib/type';

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
        description: `Get the CKB transaction hash by BTC txid.`,
        tags: ['RGB++'],
        params: z.object({
          btc_txid: z.string(),
        }),
        response: {
          200: z.object({
            txhash: z.string().describe('The CKB transaction hash'),
          }),
        },
      },
    },
    async (request, reply) => {
      const { btc_txid } = request.params;
      const transaction = await fastify.electrs.getTransaction(btc_txid);
      for (let index = 0; index < transaction.vout.length; index++) {
        const args = buildRgbppLockArgs(index, btc_txid);
        const query: CKBIndexerQueryOptions = {
          lock: genRgbppLockScript(args, process.env.NETWORK === 'mainnet'),
        };

        const collector = fastify.ckbIndexer.collector(query).collect();
        const { value: cell } = await collector[Symbol.asyncIterator]().next();
        console.log(cell);
        if (cell) {
          return { txhash: cell.outPoint.txHash };
        }
      }
      reply.status(404);
    },
  );

  fastify.get(
    '/:btc_txid/job',
    {
      schema: {
        description: `
          Get the job state of a transaction by BTC txid.

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
      const state = await job.getState();
      return { state };
    },
  );

  done();
};

export default transactionRoute;
