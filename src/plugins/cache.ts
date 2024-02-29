import fp from 'fastify-plugin';
import { env } from '../env';
import { FastifyRequest } from 'fastify';
import * as Sentry from '@sentry/node';
import { ApiCacheStatus, CUSTOM_HEADERS } from '../constants';

const getCacheKey = (request: FastifyRequest) => env.NODE_ENV + '@' + request.url;
const MAX_AGE_FOREVER = 60 * 60 * 24 * 365 * 5;

export default fp(async (fastify) => {
  try {
    const redis = fastify.container.resolve('redis');
    if (!redis) {
      fastify.addHook('onSend', (_, reply, __, next) => {
        reply.cacheControl('public');
        reply.cacheControl('max-age', 10);
        next();
      });
      return;
    }

    fastify.register(import('@fastify/redis'), { client: redis });

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
      reply.cacheControl('public');

      if (reply.getHeader(CUSTOM_HEADERS.ApiCache) === ApiCacheStatus.Hit) {
        reply.cacheControl('max-age', MAX_AGE_FOREVER);
        next();
        return;
      }

      if (reply.getHeader(CUSTOM_HEADERS.ResponseCacheable) === 'true' && payload) {
        const response = JSON.parse(payload as string);
        if (response.ok === false || !payload) {
          next();
          return;
        }
        const key = getCacheKey(request);
        const value = JSON.stringify(payload);
        fastify.redis.set(key, value, (err) => {
          if (err) {
            fastify.log.error(err);
            Sentry.captureException(err);
          }
          reply.removeHeader(CUSTOM_HEADERS.ResponseCacheable);
          reply.cacheControl('max-age', MAX_AGE_FOREVER);
          next();
        });
        return;
      }

      // cache the response for 10 seconds by default
      reply.cacheControl('max-age', 10);
      next();
    });
  } catch (err) {
    fastify.log.error(err);
    Sentry.captureException(err);
  }
});
