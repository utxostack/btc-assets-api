import { FastifyPluginCallback } from 'fastify';
import { Server } from 'http';
import generateRoute from './generate';
import { ZodTypeProvider } from 'fastify-type-provider-zod';

const tokenRoutes: FastifyPluginCallback<Record<never, never>, Server, ZodTypeProvider> = (fastify, _, done) => {
  fastify.register(generateRoute);
  done();
};

export default tokenRoutes;
