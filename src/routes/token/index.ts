import { FastifyPluginCallback } from 'fastify';
import { Server } from 'http';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import generateRoute from './generate';
import { env } from '../../env';

const tokenRoutes: FastifyPluginCallback<Record<never, never>, Server, ZodTypeProvider> = (fastify, _, done) => {
  if (env.NODE_ENV === 'production' && env.ADMIN_USERNAME && env.ADMIN_PASSWORD) {
    fastify.addHook('onRequest', async (request, reply) => {
      const { authorization } = request.headers;
      if (!authorization) {
        reply.code(401).send({ error: 'Unauthorized' });
        return;
      }

      const [scheme, token] = authorization.split(' ');
      if (scheme.toLowerCase() !== 'basic') {
        reply.code(401).send({ error: 'Unauthorized' });
        return;
      }

      const [username, password] = Buffer.from(token, 'base64').toString().split(':');
      if (username !== env.ADMIN_USERNAME || password !== env.ADMIN_PASSWORD) {
        reply.code(401).send({ error: 'Unauthorized' });
        return;
      }
    });
  }

  fastify.register(generateRoute);
  done();
};

export default tokenRoutes;
