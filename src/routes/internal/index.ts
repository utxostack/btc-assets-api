import { FastifyPluginCallback } from 'fastify';
import { Server } from 'http';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import { env } from '../../env';
import adminAuthorize from '../../hooks/admin-authorize';
import jobRoutes from './job';
import container from '../../container';

const internalRoutes: FastifyPluginCallback<Record<never, never>, Server, ZodTypeProvider> = (fastify, _, done) => {
  if (env.NODE_ENV === 'production' && env.ADMIN_USERNAME && env.ADMIN_PASSWORD) {
    fastify.addHook('onRequest', adminAuthorize);
  }

  fastify.decorate('transactionManager', container.resolve('transactionManager'));

  fastify.register(jobRoutes, { prefix: '/job' });
  done();
};

export default internalRoutes;
