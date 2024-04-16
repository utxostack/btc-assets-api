import fastify from 'fastify';
import { FastifyInstance } from 'fastify';
import { AxiosError, HttpStatusCode } from 'axios';
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
import cronRoutes from './routes/cron';
import { ElectrsAPIError, ElectrsAPINotFoundError } from './services/electrs';
import { BitcoinRPCError } from './services/bitcoind';
import { AppErrorCode } from './error';
import { provider } from 'std-env';
import ipBlock from './plugins/ip-block';
import internalRoutes from './routes/internal';
import healthcheck from './plugins/healthcheck';

if (env.SENTRY_DSN_URL) {
  Sentry.init({
    dsn: env.SENTRY_DSN_URL,
    tracesSampleRate: env.SENTRY_TRACES_SAMPLE_RATE,
    profilesSampleRate: env.SENTRY_PROFILES_SAMPLE_RATE,
    integrations: [...(env.SENTRY_PROFILES_SAMPLE_RATE > 0 ? [new ProfilingIntegration()] : [])],
  });
}

async function routes(fastify: FastifyInstance) {
  fastify.log.info(`Process env: ${JSON.stringify(getSafeEnvs(), null, 2)}`);
  if (Sentry.isInitialized()) {
    fastify.log.info('Sentry is initialized');
  }

  await fastify.register(cors);
  fastify.register(sensible);
  fastify.register(compress);
  fastify.register(swagger);
  fastify.register(jwt);
  fastify.register(ipBlock);
  fastify.register(cache);
  fastify.register(rateLimit);
  fastify.register(healthcheck);

  // Check if the Electrs API and Bitcoin JSON-RPC server are running on the correct network
  const env = container.resolve('env');
  await container.resolve('bitcoind').checkNetwork(env.NETWORK as NetworkType);
  await container.resolve('electrs').checkNetwork(env.NETWORK as NetworkType);

  fastify.register(internalRoutes, { prefix: '/internal' });
  fastify.register(tokenRoutes, { prefix: '/token' });
  fastify.register(bitcoinRoutes, { prefix: '/bitcoin/v1' });
  fastify.register(rgbppRoutes, { prefix: '/rgbpp/v1' });
  if (provider === 'vercel') {
    fastify.register(cronRoutes, { prefix: '/cron' });
  }

  fastify.addHook('onRequest', async (request) => {
    Sentry.setTag('url', request.url);
    Sentry.setContext('params', request.params ?? {});
    Sentry.setContext('query', request.query ?? {});
  });

  fastify.setErrorHandler((error, _, reply) => {
    if (
      error instanceof ElectrsAPIError ||
      error instanceof ElectrsAPINotFoundError ||
      error instanceof BitcoinRPCError
    ) {
      reply
        .status(error.statusCode ?? HttpStatusCode.InternalServerError)
        .send({ code: error.errorCode, message: error.message });
      return;
    }

    if (error instanceof AxiosError) {
      const { response } = error;
      reply.status(response?.status ?? HttpStatusCode.InternalServerError).send({
        code: AppErrorCode.UnknownResponseError,
        message: response?.data ?? error.message,
      });
      return;
    }

    // captureException only for 5xx errors or unknown errors
    if (!error.statusCode || error.statusCode >= HttpStatusCode.InternalServerError) {
      fastify.log.error(error);
      Sentry.captureException(error);
    }
    reply.status(error.statusCode ?? HttpStatusCode.InternalServerError).send({
      code: AppErrorCode.UnknownResponseError,
      message: error.message,
    });
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
