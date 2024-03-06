import { Type, TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import { FastifyPluginCallback } from 'fastify';
import { Server } from 'http';

const transactionRoute: FastifyPluginCallback<Record<never, never>, Server, TypeBoxTypeProvider> = (
  fastify,
  _,
  done,
) => {
  fastify.post(
    '/ckb-tx',
    {
      schema: {
        body: Type.Object({
          txid: Type.String(),
          ckbTx: Type.Object({}),
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
        params: Type.Object({
          txid: Type.String(),
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
