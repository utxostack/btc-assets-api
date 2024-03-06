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
    '/ckb-tx',
    {
      schema: {},
    },
    async () => {
      await Promise.race([
        fastify.transactionQueue.process(),
        new Promise((resolve) => setTimeout(resolve, 10 * 1000)),
      ]);
      await fastify.transactionQueue.close();
    },
  );

  done();
};

export default transactionRoute;
