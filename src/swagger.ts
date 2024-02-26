import { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import { FastifyPluginCallback } from 'fastify';
import swagger from '@fastify/swagger';
import swaggerUI from '@fastify/swagger-ui';
import { Server } from 'http';

const swaggerRoute: FastifyPluginCallback<Record<never, never>, Server, TypeBoxTypeProvider> = (
  fastify,
  _,
  done,
) => {
  fastify.register(swagger, {
    swagger: {
      info: {
        title: 'Bitcoin Assets API',
        version: '0.0.1',
      },
      consumes: ['application/json'],
      produces: ['application/json'],
    },
  });
  fastify.register(swaggerUI, {
    routePrefix: '/docs',
  });
  done();
};

export default swaggerRoute;
