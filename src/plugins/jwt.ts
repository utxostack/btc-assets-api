import { FastifyReply, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';
import { env } from '../env';
import jwt from '@fastify/jwt';

export const ALLOWED_URLS = ['/token', '/docs'];

export default fp(async (fastify) => {
  fastify.register(jwt, {
    secret: env.JWT_SECRET,
  });
  fastify.addHook('onRequest', async (request: FastifyRequest, reply: FastifyReply) => {
    if (request.method.toLowerCase() === 'options' || ALLOWED_URLS.some((prefix) => request.url.startsWith(prefix))) {
      return;
    }
    try {
      await request.jwtVerify();
    } catch (err) {
      reply.status(401).send(err);
    }
  });
});
