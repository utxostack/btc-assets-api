import { FastifyReply, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';
import { env } from '../env';
import jwt from '@fastify/jwt';
import { JWT_IGNORE_URLS } from '../constants';

export default fp(async (fastify) => {
  fastify.register(jwt, {
    secret: env.JWT_SECRET,
  });
  fastify.addHook('onRequest', async (request: FastifyRequest, reply: FastifyReply) => {
    if (
      request.method.toLowerCase() === 'options' ||
      JWT_IGNORE_URLS.some((prefix) => request.url.startsWith(prefix))
    ) {
      return;
    }
    try {
      await request.jwtVerify();
      const { origin } = request.headers;
      const jwt = (await request.jwtDecode()) as { aud: string };
      if (!origin || new URL(origin).hostname !== jwt.aud) {
        reply.status(401).send('Invalid token');
      }
    } catch (err) {
      reply.status(401).send(err);
    }
  });
});
