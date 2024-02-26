import { Type, TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import { FastifyPluginCallback } from 'fastify';
import { Server } from 'http';
import { Block } from './types';

const blockRoutes: FastifyPluginCallback<Record<never, never>, Server, TypeBoxTypeProvider> = (
  fastify,
  _,
  done,
) => {
  fastify.get(
    '/:hash',
    {
      schema: {
        params: Type.Object({
          hash: Type.String(),
        }),
        response: {
          200: Block,
        },
      },
    },
    async (request, reply) => {
      const { hash } = request.params;
      const [block, chain] = await Promise.all([
        fastify.electrs.getBlockByHash(hash),
        fastify.bitcoind.getBlockchainInfo(),
      ]);
      if (block.height < chain.blocks) {
        reply.header('x-block-confirmed', 'true');
      }
      return block;
    },
  );

  done();
};

export default blockRoutes;
