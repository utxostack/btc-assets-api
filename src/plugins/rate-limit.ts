import fp from 'fastify-plugin';
import { env } from '../env';
import * as Sentry from '@sentry/node';

export default fp(async (fastify) => {
  try {
    const redis = fastify.container.resolve('redis');
    fastify.register(import('@fastify/rate-limit'), {
      max: env.RATE_LIMIT_PER_MINUTE,
      redis,
    });
  } catch (err) {
    fastify.log.error(err);
    Sentry.captureException(err);
  }
});
