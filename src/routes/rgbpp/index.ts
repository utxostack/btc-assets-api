import { FastifyPluginCallback } from 'fastify';
import { Server } from 'http';
import container from '../../container';
import transactionRoutes from './transaction';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import assetsRoute from './assets';

const rgbppRoutes: FastifyPluginCallback<Record<never, never>, Server, ZodTypeProvider> = (fastify, _, done) => {
  fastify.decorate('transactionManager', container.resolve('transactionManager'));
  fastify.decorate('ckbRPC', container.resolve('ckbRpc'));
  fastify.decorate('ckbIndexer', container.resolve('ckbIndexer'));

  fastify.register(transactionRoutes, { prefix: '/transaction' });
  fastify.register(assetsRoute, { prefix: '/assets' });
  done();
};

export default rgbppRoutes;
