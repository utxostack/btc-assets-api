import fastify from 'fastify';
import { FastifyInstance } from 'fastify';
import { AxiosError } from 'axios';
import sensible from '@fastify/sensible';
import compress from '@fastify/compress';
import * as Sentry from '@sentry/node';
import { ProfilingIntegration } from '@sentry/profiling-node';
import bitcoinRoutes from './routes/bitcoin';
import tokenRoutes from './routes/token';
import swagger from './plugins/swagger';
import jwt from './plugins/jwt';
import cache from './plugins/cache';
import rateLimit from './plugins/rate-limit';
import { env, getSafeEnvs } from './env';
import container from './container';
import { asValue } from 'awilix';
import options from './options';
import { serializerCompiler, validatorCompiler, ZodTypeProvider } from 'fastify-type-provider-zod';
import cors from './plugins/cors';
import { NetworkType } from './constants';
import rgbppRoutes from './routes/rgbpp';

if (env.SENTRY_DSN_URL && env.NODE_ENV !== 'development') {
  Sentry.init({
    dsn: env.SENTRY_DSN_URL,
    tracesSampleRate: 1.0,
    profilesSampleRate: 1.0,
    integrations: [new ProfilingIntegration()],
  });
}

const isTokenRoutesEnable = env.NODE_ENV === 'production' ? env.ADMIN_USERNAME && env.ADMIN_PASSWORD : true;

async function routes(fastify: FastifyInstance) {
  fastify.log.info(`Process env: ${JSON.stringify(getSafeEnvs(), null, 2)}`);

  container.register({ logger: asValue(fastify.log) });
  fastify.decorate('container', container);

  await fastify.register(cors);
  fastify.register(sensible);
  fastify.register(compress);
  fastify.register(swagger);
  fastify.register(jwt);
  fastify.register(cache);
  fastify.register(rateLimit);

  // Check if the Electrs API and Bitcoin JSON-RPC server are running on the correct network
  const env = container.resolve('env');
  await container.resolve('bitcoind').checkNetwork(env.NETWORK as NetworkType);
  await container.resolve('electrs').checkNetwork(env.NETWORK as NetworkType);

  if (isTokenRoutesEnable) {
    fastify.register(tokenRoutes, { prefix: '/token' });
  }
  fastify.register(bitcoinRoutes, { prefix: '/bitcoin/v1' });
  fastify.register(rgbppRoutes, { prefix: '/rgbpp/v1' });

  fastify.setErrorHandler((error, _, reply) => {
    fastify.log.error(error);
    Sentry.captureException(error);
    if (error instanceof AxiosError) {
      const { response } = error;
      reply.status(response?.status ?? 500).send({ ok: false, error: response?.data ?? error.message });
      return;
    }
    reply.status(error.statusCode ?? 500).send({ ok: false, statusCode: error.statusCode, message: error.message });
  });
}

export function buildFastify() {
  const app = fastify(options).withTypeProvider<ZodTypeProvider>();
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  container.register({ logger: asValue(app.log) });
  app.decorate('container', container);

  app.register(routes);
  return app;
}
