import { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import { FastifyPluginCallback } from 'fastify';
import { Server } from 'http';
import balanceRoute from './balance';

const addressRoutes: FastifyPluginCallback<
  Record<never, never>,
  Server,
  TypeBoxTypeProvider
> = (fastify, _, done) => {
  fastify.register(balanceRoute);
  done();
};

export default addressRoutes;
