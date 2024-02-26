import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import jwt from '@fastify/jwt';
import { AxiosError } from 'axios';
import bitcoinRoutes from './routes/bitcoin';
import swagger from '@fastify/swagger';
import swaggerUI from '@fastify/swagger-ui';
import { env } from './env';
import tokenRoutes from './routes/token';

async function routes(fastify: FastifyInstance) {
  fastify.register(swagger, {
    swagger: {
      info: {
        title: 'Bitcoin Assets API',
        version: '0.0.1',
      },
      consumes: ['application/json'],
      produces: ['application/json'],
      security: [{ apiKey: [] }],
      securityDefinitions: {
        apiKey: {
          type: 'apiKey',
          name: 'Authorization',
          in: 'header',
        },
      },
    },
  });
  fastify.register(swaggerUI, {
    routePrefix: '/docs',
  });

  fastify.register(jwt, {
    secret: env.JWT_SECRET,
  });
  fastify.addHook('onRequest', async (request: FastifyRequest, reply: FastifyReply) => {
    if (request.url.startsWith('/token') || request.url.startsWith('/docs')) return;
    try {
      await request.jwtVerify();
    } catch (err) {
      reply.status(401).send(err);
    }
  });

  fastify.register(tokenRoutes, { prefix: '/token' });
  fastify.register(bitcoinRoutes, { prefix: '/bitcoin/v1' });

  fastify.setErrorHandler((error, _, reply) => {
    if (error instanceof AxiosError) {
      reply
        .status(error.response?.status || 500)
        .send({ ok: false, error: error.response?.data.error ?? error.message });
      return;
    }
    reply
      .status(error.statusCode ?? 500)
      .send({ ok: false, statusCode: error.statusCode, message: error.message });
  });
}

export default routes;
