import { FastifyPluginCallback } from 'fastify';
import { Server } from 'http';
import container from '../../container';
import transactionRoutes from './transaction';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import assetsRoute from './assets';
import addressRoutes from './address';
import spvRoute from './spv';

const rgbppRoutes: FastifyPluginCallback<Record<never, never>, Server, ZodTypeProvider> = (fastify, _, done) => {
  fastify.decorate('transactionManager', container.resolve('transactionManager'));
  fastify.decorate('paymaster', container.resolve('paymaster'));
  fastify.decorate('ckbRPC', container.resolve('ckbRpc'));
  fastify.decorate('ckbIndexer', container.resolve('ckbIndexer'));
  fastify.decorate('electrs', container.resolve('electrs'));
  fastify.decorate('bitcoinSPV', container.resolve('bitcoinSPV'));

  fastify.register(transactionRoutes, { prefix: '/transaction' });
  fastify.register(assetsRoute, { prefix: '/assets' });
  fastify.register(addressRoutes, { prefix: '/address' });
  fastify.register(spvRoute, { prefix: '/btc-spv' });
  done();
};

export default rgbppRoutes;
