import { FastifyInstance } from 'fastify';
import swagger from '@fastify/swagger';
import swaggerUI from '@fastify/swagger-ui';
import bitcoinRoutes from './routes/bitcoin';
// import proxy from '@fastify/http-proxy';
// import { env } from './env';
import { AxiosError } from 'axios';

async function routes(fastify: FastifyInstance) {
  await fastify.register(swagger, {
    swagger: {
      info: {
        title: 'Bitcoin API',
        description: 'Bitcoin API Documentation',
        version: '0.0.1',
      },
      consumes: ['application/json'],
      produces: ['application/json'],
    },
  });
  await fastify.register(swaggerUI, {
    routePrefix: '/docs',
  });

  // fastify.register(proxy, {
  //   upstream: env.ORDINALS_API_BASE_URL,
  //   prefix: '/ordinals/v1',
  // });

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
