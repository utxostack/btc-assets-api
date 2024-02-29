import { FastifyInstance } from 'fastify';
import { AxiosError } from 'axios';
import cors from '@fastify/cors';
import sensible from '@fastify/sensible';
import compress from '@fastify/compress'
import * as Sentry from '@sentry/node';
import { ProfilingIntegration } from '@sentry/profiling-node';
import bitcoinRoutes from './routes/bitcoin';
import tokenRoutes from './routes/token';
import swaggerPlugin from './plugins/swagger';
import jwtPlugin from './plugins/jwt';
import cachePlugin from './plugins/cache';
import rateLimitPlugin from './plugins/rate-limit';
import { env } from './env';

if (env.SENTRY_DSN_URL && env.NODE_ENV !== 'development') {
  Sentry.init({
    dsn: env.SENTRY_DSN_URL,
    tracesSampleRate: 1.0,
    profilesSampleRate: 1.0,
    integrations: [new ProfilingIntegration()],
  });
}

async function routes(fastify: FastifyInstance) {
  fastify.register(sensible);
  fastify.register(compress);
  await fastify.register(cors, {
    origin: '*',
  });

  fastify.register(rateLimitPlugin);
  fastify.register(swaggerPlugin);
  fastify.register(jwtPlugin);
  fastify.register(cachePlugin);

  fastify.register(tokenRoutes, { prefix: '/token' });
  fastify.register(bitcoinRoutes, { prefix: '/bitcoin/v1' });

  fastify.setErrorHandler((error, _, reply) => {
    fastify.log.error(error);
    Sentry.captureException(error);
    if (error instanceof AxiosError) {
      reply
        .status(error.response?.status || 500)
        .send({ ok: false, error: error.response?.data ?? error.message });
      return;
    }
    reply
      .status(error.statusCode ?? 500)
      .send({ ok: false, statusCode: error.statusCode, message: error.message });
  });
}

export default routes;
