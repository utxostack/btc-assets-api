import fp from 'fastify-plugin';
import swagger from '@fastify/swagger';
import swaggerUI from '@fastify/swagger-ui';
import { jsonSchemaTransform } from 'fastify-type-provider-zod';

export const DOCS_ROUTE_PREFIX = '/docs';

export default fp(async (fastify) => {
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
    transform: jsonSchemaTransform,
  });
  fastify.register(swaggerUI, {
    routePrefix: DOCS_ROUTE_PREFIX,
  });
});
