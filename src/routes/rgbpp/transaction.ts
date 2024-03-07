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
      const job = await fastify.transactionManager.enqueueTransaction({ txid, transaction: ckbTx });
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
      const job = await fastify.transactionManager.getTransactionRequest(txid);
      if (!job) {
        reply.status(404).send({ message: 'Transaction not found' });
        return;
      }
      const ckbTxhash = job.returnvalue;
      const tx = await fastify.ckbRPC.getTransaction(ckbTxhash);
      console.log('tx', tx);
      // TODO: get ckb tx hash from job return value, and query ckb node for tx status
      reply.send(tx);
    },
  );

  done();
};

export default transactionRoute;
