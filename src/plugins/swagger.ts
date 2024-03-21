import fp from 'fastify-plugin';
import swagger from '@fastify/swagger';
import swaggerUI from '@fastify/swagger-ui';
import { jsonSchemaTransform } from 'fastify-type-provider-zod';
import { env } from '../env';

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
          description: 'JWT token for authentication. Example: Bearer <token>',
        },
      },
    },
    transform: jsonSchemaTransform,
    transformObject: ({ swaggerObject }) => {
      if (env.NODE_ENV === 'production') {
        const { paths = {} } = swaggerObject;
        const newPaths = Object.entries(paths).reduce((acc, [path, methods]) => {
          if (path.startsWith('/token')) {
            return acc;
          }
          return { ...acc, [path]: methods };
        }, {});
        swaggerObject.paths = newPaths;
      }
      return swaggerObject;
    },
  });
  fastify.register(swaggerUI, {
    routePrefix: DOCS_ROUTE_PREFIX,
    uiConfig: {
      defaultModelRendering: 'model',
      defaultModelExpandDepth: 4,
      defaultModelsExpandDepth: 4,
    },
  });
});
