import { FastifyInstance } from 'fastify';
import bitcoinRoutes from './routes/bitcoin';
import { AxiosError } from 'axios';
import swaggerRoute from './swagger';

async function routes(fastify: FastifyInstance) {
  fastify.register(swaggerRoute);
  fastify.register(bitcoinRoutes, { prefix: '/bitcoin/v1' });

  fastify.setErrorHandler((error, _, reply) => {
    if (error instanceof AxiosError) {
      reply
        .status(error.response?.status || 500)
        .send({ ok: false, error: error.response?.data.error ?? error.message });
      return;
    }
    console.log(error);
    reply.status(500).send({ ok: false });
  });
}

export default routes;
