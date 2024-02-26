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
        }
      },
    },
    async (request) => {
      const { hash } = request.params;
      const blockchainInfo = await fastify.electrs.getBlockByHash(hash);
      return blockchainInfo;
    },
  );
  done();
};

export default blockRoutes;
