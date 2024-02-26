import { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import { FastifyPluginCallback } from 'fastify';
import { Server } from 'http';
import generateRoute from './generate';

const tokenRoutes: FastifyPluginCallback<Record<never, never>, Server, TypeBoxTypeProvider> = (
  fastify,
  _,
  done,
) => {
  fastify.register(generateRoute);
  done();
};

export default tokenRoutes;
