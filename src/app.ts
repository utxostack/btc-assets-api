import fastify from 'fastify';
import { FastifyInstance } from 'fastify';
import sensible from '@fastify/sensible';
import compress from '@fastify/compress';
import bitcoinRoutes from './routes/bitcoin';
import tokenRoutes from './routes/token';
import swagger from './plugins/swagger';
import jwt from './plugins/jwt';
import cache from './plugins/cache';
import rateLimit from './plugins/rate-limit';
import { getSafeEnvs } from './env';
import container from './container';
import { asValue } from 'awilix';
import options from './options';
import { serializerCompiler, validatorCompiler, ZodTypeProvider } from 'fastify-type-provider-zod';
import cors from './plugins/cors';
import { NetworkType } from './constants';
import rgbppRoutes from './routes/rgbpp';
import cronRoutes from './routes/cron';
import { provider } from 'std-env';
import ipBlock from './plugins/ip-block';
import internalRoutes from './routes/internal';
import healthcheck from './plugins/healthcheck';
import sentry from './plugins/sentry';
import cron from './plugins/cron';

async function routes(fastify: FastifyInstance) {
  fastify.log.info(`Process env: ${JSON.stringify(getSafeEnvs(), null, 2)}`);

  await fastify.register(cors);
  await fastify.register(sentry);
  fastify.register(sensible);
  fastify.register(compress);
  fastify.register(swagger);
  fastify.register(jwt);
  fastify.register(ipBlock);
  fastify.register(cache);
  fastify.register(rateLimit);
  fastify.register(healthcheck);

  const env = container.resolve('env');
  await container.resolve('bitcoin').checkNetwork(env.NETWORK as NetworkType);

  fastify.register(internalRoutes, { prefix: '/internal' });
  fastify.register(tokenRoutes, { prefix: '/token' });
  fastify.register(bitcoinRoutes, { prefix: '/bitcoin/v1' });
  fastify.register(rgbppRoutes, { prefix: '/rgbpp/v1' });

  // register cron routes only on Vercel
  if (provider === 'vercel' || env.NODE_ENV === 'test') {
    fastify.log.info('Cron routes is registered');
    fastify.register(cronRoutes, { prefix: '/cron' });
  } else {
    fastify.log.info('Cron plugin is registered');
    await fastify.register(cron);
    fastify.addHook('onReady', () => {
      fastify.cron.startAllJobs();
    });
  }
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
