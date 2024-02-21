import { FastifyInstance } from 'fastify';
import proxy from '@fastify/http-proxy';
import { env } from './env';

async function routes(fastify: FastifyInstance) {
  fastify.register(proxy, {
    upstream: env.ORDINALS_API_BASE_URL,
    prefix: '/ordinals/v1',
    rewritePrefix: '/ordinals/v1',
  });

  fastify.get('/', async () => {
    return { hello: 'world' };
  });
}

export default routes;
