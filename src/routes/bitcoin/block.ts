import { FastifyPluginCallback } from 'fastify';
import { Server } from 'http';
import { Block } from './types';
import { CUSTOM_HEADERS } from '../../constants';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import z from 'zod';

const blockRoutes: FastifyPluginCallback<Record<never, never>, Server, ZodTypeProvider> = (fastify, _, done) => {
  fastify.get(
    '/:hash',
    {
      schema: {
        description: 'Get a block by its hash',
        tags: ['Bitcoin'],
        params: z.object({
          hash: z.string().length(64, 'should be a 64-character hex string').describe('The Bitcoin block hash'),
        }),
        response: {
          200: Block,
        },
      },
    },
    async (request, reply) => {
      const { hash } = request.params;
      const block = await fastify.bitcoin.getBlock({ hash });
      reply.header(CUSTOM_HEADERS.ResponseCacheable, 'true');
      return block;
    },
  );

  fastify.get(
    '/:hash/txids',
    {
      schema: {
        description: 'Get block transaction ids by its hash',
        tags: ['Bitcoin'],
        params: z.object({
          hash: z.string().length(64, 'should be a 64-character hex string').describe('The Bitcoin block hash'),
        }),
        response: {
          200: z.object({
            txids: z.array(z.string()),
          }),
        },
      },
    },
    async (request, reply) => {
      const { hash } = request.params;
      const txids = await fastify.bitcoin.getBlockTxids({ hash });
      reply.header(CUSTOM_HEADERS.ResponseCacheable, 'true');
      return { txids };
    },
  );

  fastify.get(
    '/:hash/header',
    {
      schema: {
        description: 'Get a block header by its hash',
        tags: ['Bitcoin'],
        params: z.object({
          hash: z.string().length(64, 'should be a 64-character hex string').describe('The Bitcoin block hash'),
        }),
        response: {
          200: z.object({
            header: z.string(),
          }),
        },
      },
    },
    async (request, reply) => {
      const { hash } = request.params;
      const header = await fastify.bitcoin.getBlockHeader({ hash });
      reply.header(CUSTOM_HEADERS.ResponseCacheable, 'true');
      return {
        header,
      };
    },
  );

  fastify.get(
    '/height/:height',
    {
      schema: {
        description: 'Get a block hash by its height',
        tags: ['Bitcoin'],
        params: z.object({
          height: z
            .string()
            .min(1, 'cannot be empty')
            .pipe(z.coerce.number().min(0, 'cannot be negative'))
            .describe('The Bitcoin block height'),
        }),
        response: {
          200: z.object({
            hash: z.string(),
          }),
        },
      },
    },
    async (request, reply) => {
      const { height } = request.params;
      const [hash, chain] = await Promise.all([
        fastify.bitcoin.getBlockHeight({ height }),
        fastify.bitcoin.getBlockchainInfo(),
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
