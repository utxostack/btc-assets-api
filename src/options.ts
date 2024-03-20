import { FastifyBaseLogger, FastifyHttpOptions } from 'fastify';
import { provider } from 'std-env';
import { Server } from 'http';
import { env } from './env';

const envToLogger = {
  development:
    provider !== 'vercel'
      ? {
          transport: {
            target: 'pino-pretty',
            options: {
              translateTime: 'HH:MM:ss Z',
              ignore: 'pid,hostname',
            },
          },
        }
      : true,
  production: true,
};

const options: FastifyHttpOptions<Server, FastifyBaseLogger> = {
  logger: envToLogger[env.NODE_ENV as keyof typeof envToLogger],
};

export default options;
