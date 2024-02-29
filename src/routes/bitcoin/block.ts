import { Type, TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import { FastifyPluginCallback } from 'fastify';
import { Server } from 'http';
import { Block } from './types';
import { CUSTOM_HEADERS } from '../../constants';

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
        reply.header(CUSTOM_HEADERS.ResponseCacheable, 'true');
      }
      return block;
    },
  );

  fastify.get(
    '/:hash/header',
    {
      schema: {
        params: Type.Object({
          hash: Type.String(),
        }),
        response: {
          200: Type.Object({
            header: Type.String(),
          }),
        },
      },
    },
    async (request) => {
      const { hash } = request.params;
      const header = await fastify.electrs.getBlockHeaderByHash(hash);
      return {
        header,
      };
    },
  );

  fastify.get(
    '/height/:height',
    {
      schema: {
        params: Type.Object({
          height: Type.Number(),
        }),
        response: {
          200: Type.Object({
            hash: Type.String(),
          }),
        },
      },
    },
    async (request, reply) => {
      const { height } = request.params;
      const [hash, chain] = await Promise.all([
        fastify.electrs.getBlockByHeight(height),
        fastify.bitcoind.getBlockchainInfo(),
      ]);
      if (height < chain.blocks) {
        reply.header(CUSTOM_HEADERS.ResponseCacheable, 'true');
      }
      return { hash };
    },
  );

  done();
};

export default blockRoutes;
