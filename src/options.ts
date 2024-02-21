import { FastifyBaseLogger, FastifyHttpOptions } from 'fastify';
import { Server } from 'http';

const options: FastifyHttpOptions<Server, FastifyBaseLogger> = {
  logger: true,
};

export default options;
