import { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import { FastifyPluginCallback } from 'fastify';
import { Server } from 'http';
import balanceRoute from './balance';
import unspentRoute from './unspent';

const addressRoutes: FastifyPluginCallback<
  Record<never, never>,
  Server,
  TypeBoxTypeProvider
> = (fastify, _, done) => {
  fastify.register(balanceRoute);
  fastify.register(unspentRoute);
  done();
};

export default addressRoutes;
