import fp from 'fastify-plugin';
import { env } from '../env';
import Redis from 'ioredis';

export default fp(async (fastify) => {
  if (!env.REDIS_URL) {
    return;
  }

  fastify.register(import('@fastify/rate-limit'), {
    max: env.RATE_LIMIT_PER_MINUTE,
    hook: 'preHandler',
    redis: new Redis(env.REDIS_URL),
  });
});
