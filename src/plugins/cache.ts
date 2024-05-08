import fp from 'fastify-plugin';
import { env } from '../env';
import { FastifyReply, FastifyRequest } from 'fastify';
import { ApiCacheStatus, CUSTOM_HEADERS } from '../constants';
import { DOCS_ROUTE_PREFIX } from './swagger';

const getCacheKey = (request: FastifyRequest) => env.NODE_ENV + '@' + request.url;
const MAX_AGE_FOREVER = 60 * 60 * 24 * 365 * 5;

function setCacheControlHeaders(reply: FastifyReply) {
  reply.cacheControl('public');

  const maxAge = reply.getHeader(CUSTOM_HEADERS.ResponseCacheMaxAge) as number | undefined;
  if (maxAge) {
    reply.removeHeader(CUSTOM_HEADERS.ResponseCacheMaxAge);
    reply.cacheControl('max-age', maxAge);
    return;
  }

  reply.cacheControl('max-age', MAX_AGE_FOREVER);
}

export default fp(async (fastify) => {
  try {
    const redis = fastify.container.resolve('redis');
    await fastify.register(import('@fastify/redis'), { client: redis });

    fastify.addHook('onRequest', (request, reply, done) => {
      if (request.url.startsWith(DOCS_ROUTE_PREFIX)) {
        done();
        return;
      }

      // if the request cache is exist, return it
      const key = getCacheKey(request);
      fastify.Sentry.startSpan({ op: 'cache/get', name: key }, () => {
        fastify.redis.get(key, async (err, result) => {
          if (!err && result) {
            const response = JSON.parse(result);
            reply.header('Content-Type', 'application/json');

            const ttl = await fastify.redis.ttl(key);
            reply.header(CUSTOM_HEADERS.ApiCache, ApiCacheStatus.Hit);
            reply.header(CUSTOM_HEADERS.ResponseCacheMaxAge, ttl);

            reply.send(response);
            return;
          }
          if (err) {
            fastify.log.error(err);
            fastify.Sentry.captureException(err);
          }

          reply.header(CUSTOM_HEADERS.ApiCache, ApiCacheStatus.Miss);
          done();
        });
      });
    });

    fastify.addHook('onSend', (request, reply, payload, next) => {
      if (request.url.startsWith(DOCS_ROUTE_PREFIX)) {
        next();
        return;
      }

      // if the response is already cached, don't cache it again
      if (reply.getHeader(CUSTOM_HEADERS.ApiCache) === ApiCacheStatus.Hit) {
        setCacheControlHeaders(reply);
        next();
        return;
      }

      // if the response is cacheable, cache it for future requests
      if (reply.getHeader(CUSTOM_HEADERS.ResponseCacheable) === 'true' && payload) {
        const response = JSON.parse(payload as string);
        if (response.ok === false || !payload) {
          next();
          return;
        }
        const key = getCacheKey(request);
        const value = JSON.stringify(payload);
        const maxAge = reply.getHeader(CUSTOM_HEADERS.ResponseCacheMaxAge) as number | undefined;
        fastify.Sentry.startSpan({ op: 'cache/set', name: key }, () => {
          fastify.redis.set(key, value, 'EX', maxAge ?? MAX_AGE_FOREVER, (err) => {
            if (err) {
              fastify.log.error(err);
              fastify.Sentry.captureException(err);
            }
            reply.removeHeader(CUSTOM_HEADERS.ResponseCacheable);
            setCacheControlHeaders(reply);
            next();
          });
        });
        return;
      }

      next();
    });
  } catch (err) {
    fastify.log.error(err);
    fastify.Sentry.captureException(err);
  }
});
