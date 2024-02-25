import { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import { FastifyPluginCallback } from 'fastify';
import { Server } from 'http';
import balanceRoute from './balance';
import unspentRoute from './unspent';
import transactionsRoute from './txs';

const addressRoutes: FastifyPluginCallback<
  Record<never, never>,
  Server,
  TypeBoxTypeProvider
> = (fastify, _, done) => {
  fastify.register(balanceRoute);
  fastify.register(unspentRoute);
  fastify.register(transactionsRoute);
  done();
};

export default addressRoutes;
