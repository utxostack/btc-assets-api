import { FastifyInstance } from 'fastify';
import proxy from '@fastify/http-proxy';
import bitcoinRoutes from './routes/bitcoin';
import { env } from './env';
import { AxiosError } from 'axios';

async function routes(fastify: FastifyInstance) {
  fastify.register(proxy, {
    upstream: env.ORDINALS_API_BASE_URL,
    prefix: '/ordinals/v1',
  });

  fastify.register(bitcoinRoutes, { prefix: '/bitcoin' });
  fastify.register(bitcoinRoutes, { prefix: '/bitcoin/v1' });

  fastify.setErrorHandler((error, _, reply) => {
    if (error instanceof AxiosError) {
      reply
        .status(error.response?.status || 500)
        .send({ ok: false, error: error.response?.data.error ?? error.message });
      return;
    }
    reply.status(500).send({ ok: false });
  });
}

export default routes;
