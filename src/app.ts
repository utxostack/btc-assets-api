import { FastifyInstance } from 'fastify';
import { AxiosError } from 'axios';
import bitcoinRoutes from './routes/bitcoin';
import { env } from './env';
import tokenRoutes from './routes/token';
import swaggerPlugin from './plugins/swagger';
import jwtPlugin from './plugins/jwt';
import cachePlugin from './plugins/cache';
import rateLimitPlugin from './plugins/rate-limit';
import * as Sentry from '@sentry/node';

if (env.SENTRY_DSN_URL && env.NODE_ENV !== 'development') {
  Sentry.init({
    dsn: env.SENTRY_DSN_URL,
    tracesSampleRate: 1.0,
  });
}

async function routes(fastify: FastifyInstance) {
  fastify.register(rateLimitPlugin);
  fastify.register(swaggerPlugin);
  fastify.register(jwtPlugin);
  fastify.register(cachePlugin);

  fastify.register(tokenRoutes, { prefix: '/token' });
  fastify.register(bitcoinRoutes, { prefix: '/bitcoin/v1' });

  fastify.setErrorHandler((error, _, reply) => {
    Sentry.captureException(error);
    if (error instanceof AxiosError) {
      reply
        .status(error.response?.status || 500)
        .send({ ok: false, error: error.response?.data.error ?? error.message });
      return;
    }
    reply
      .status(error.statusCode ?? 500)
      .send({ ok: false, statusCode: error.statusCode, message: error.message });
  });
}

export default routes;
