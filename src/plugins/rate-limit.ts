import fp from 'fastify-plugin';
import { env } from '../env';
import * as Sentry from '@sentry/node';
import Redis from 'ioredis';

export default fp(async (fastify) => {
  if (!env.REDIS_URL) {
    return;
  }

  try {
    const redis = new Redis(env.REDIS_URL);
    fastify.register(import('@fastify/rate-limit'), {
      max: env.RATE_LIMIT_PER_MINUTE,
      redis,
    });
  } catch (err) {
    fastify.log.error(err);
    Sentry.captureException(err);
  }
});
