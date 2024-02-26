import fp from 'fastify-plugin';
import swagger from '@fastify/swagger';
import swaggerUI from '@fastify/swagger-ui';

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
  });
  fastify.register(swaggerUI, {
    routePrefix: '/docs',
  });
});
