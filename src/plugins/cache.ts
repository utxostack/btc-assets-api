import fp from 'fastify-plugin';
import { env } from '../env';
import { FastifyRequest } from 'fastify';
import * as Sentry from '@sentry/node';
import { Redis } from 'ioredis';
import { ApiCacheStatus, CUSTOM_HEADERS } from '../constants';

const getCacheKey = (request: FastifyRequest) => env.NODE_ENV + '@' + request.url;

export default fp(async (fastify) => {
  if (!env.REDIS_URL) {
    return;
  }

  try {
    const client = new Redis(env.REDIS_URL);
    fastify.register(import('@fastify/redis'), { client });

    fastify.addHook('onRequest', (request, reply, done) => {
      const key = getCacheKey(request);
      fastify.redis.get(key, (err, result) => {
        if (!err && result) {
          const response = JSON.parse(result);
          reply.header('Content-Type', 'application/json');
          reply.header(CUSTOM_HEADERS.ApiCache, ApiCacheStatus.Hit);
          reply.send(response);
          return;
        }
        if (err) {
          fastify.log.error(err);
          Sentry.captureException(err);
        }

        reply.header(CUSTOM_HEADERS.ApiCache, ApiCacheStatus.Miss);
        done();
      });
    });

    fastify.addHook('onSend', (request, reply, payload, next) => {
      if (reply.getHeader(CUSTOM_HEADERS.ApiCache) === ApiCacheStatus.Hit) {
        next();
        return;
      }
      if (reply.getHeader(CUSTOM_HEADERS.ResponseCacheable) === 'true' && payload) {
        const response = JSON.parse(payload as string);
        if (response.ok === false) {
          next();
          return;
        }
        const key = getCacheKey(request);
        const value = JSON.stringify(payload);
        if (value.length === 0) {
          next();
          return;
        }
        fastify.redis.set(key, value, (err) => {
          if (err) {
            fastify.log.error(err);
            Sentry.captureException(err);
          }
          next();
        });
        return;
      }

      next();
    });
  } catch (err) {
    fastify.log.error(err);
    Sentry.captureException(err);
  }
});
