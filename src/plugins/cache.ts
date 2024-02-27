import fp from 'fastify-plugin';
import { env } from '../env';
import { FastifyRequest } from 'fastify';
import * as Sentry from '@sentry/node';
import { Redis } from 'ioredis';

const getCacheKey = (request: FastifyRequest) => env.NODE_ENV + '@' + request.url;

export default fp(async (fastify) => {
  if (!env.REDIS_URL) {
    return;
  }

  fastify.register(import('@fastify/redis'), {
    client: new Redis(env.REDIS_URL),
  });

  fastify.addHook('onRequest', (request, reply, done) => {
    const key = getCacheKey(request);
    fastify.redis.get(key, (err, result) => {
      if (!err && result) {
        const response = JSON.parse(result);
        reply.header('x-api-cache', 'HIT');
        reply.header('Content-Type', 'application/json');
        reply.send(response);
        return;
      }
      if (err) {
        fastify.log.error(err);
        Sentry.captureException(err);
      }

      reply.header('X-api-cache', 'MISS');
      done();
    });
  });

  fastify.addHook('onSend', (request, reply, payload, next) => {
    if (reply.getHeader('x-api-cache') === 'HIT') {
      next();
      return;
    }
    if (reply.getHeader('x-block-confirmed') === 'true' && payload) {
      const response = JSON.parse(payload as string);
      if (response.ok === false) {
        next();
        return;
      }
      const key = getCacheKey(request);
      fastify.redis.set(key, JSON.stringify(payload), (err) => {
        if (err) {
          fastify.log.error(err);
          Sentry.captureException(err);
        }
        reply.removeHeader('x-block-confirmed');
        next();
      });
      return;
    }

    next();
  });
});
