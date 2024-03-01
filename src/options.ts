import { FastifyBaseLogger, FastifyHttpOptions } from 'fastify';
import { Server } from 'http';
import { env } from './env';

const envToLogger = {
  development: {
    transport: {
      target: 'pino-pretty',
      options: {
        translateTime: 'HH:MM:ss Z',
        ignore: 'pid,hostname',
      },
    },
  },
  production: true,
}

const options: FastifyHttpOptions<Server, FastifyBaseLogger> = {
  logger: envToLogger[env.NODE_ENV as keyof typeof envToLogger],
};

export default options;
