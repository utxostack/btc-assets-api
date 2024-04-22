import { FastifyPluginCallback } from 'fastify';
import { Server } from 'http';
import infoRoute from './info';
import blockRoutes from './block';
import transactionRoutes from './transaction';
import addressRoutes from './address';
import container from '../../container';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import Bitcoin from '../../services/bitcoin';

const bitcoinRoutes: FastifyPluginCallback<Record<never, never>, Server, ZodTypeProvider> = (fastify, _, done) => {
  fastify.decorate('bitcoin', container.resolve<Bitcoin>('bitcoin'));

  fastify.register(infoRoute);
  fastify.register(blockRoutes, { prefix: '/block' });
  fastify.register(transactionRoutes, { prefix: '/transaction' });
  fastify.register(addressRoutes, { prefix: '/address' });
  done();
};

export default bitcoinRoutes;
