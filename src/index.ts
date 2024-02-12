import process from 'node:process';
import fastify from 'fastify';
import proxy from '@fastify/http-proxy';
import { env } from './env';

const server = fastify();

server.register(proxy, {
  upstream: env.ORDINALS_API_BASE_URL,
  prefix: '/ordinals/v1',
});

server.listen({ port: 8080 }, (err, address) => {
  if (err) {
    console.error(err);
    process.exit(1);
  }
  // eslint-disable-next-line no-console
  console.log(`Server listening at ${address}`);
});
