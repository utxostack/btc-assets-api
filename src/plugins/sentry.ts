import fp from 'fastify-plugin';
import fastifySentry from '@immobiliarelabs/fastify-sentry';
import { ProfilingIntegration } from '@sentry/profiling-node';
import pkg from '../../package.json';
import { env } from '../env';

export default fp(async (fastify) => {
  // @ts-expect-error - fastify-sentry types are not up to date
  fastify.register(fastifySentry, {
    dsn: env.SENTRY_DSN_URL,
    tracesSampleRate: env.SENTRY_TRACES_SAMPLE_RATE,
    profilesSampleRate: env.SENTRY_PROFILES_SAMPLE_RATE,
    integrations: [...(env.SENTRY_PROFILES_SAMPLE_RATE > 0 ? [new ProfilingIntegration()] : [])],
    environment: env.NODE_ENV,
    release: pkg.version,
    // use custom error handler instead of the default one
    setErrorHandler: false,
  });
});
