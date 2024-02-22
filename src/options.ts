import { FastifyBaseLogger, FastifyHttpOptions } from 'fastify';
import { Server } from 'http';

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
  logger: envToLogger[process.env.NODE_ENV as 'development' | 'production'],
};

export default options;
