import fp from 'fastify-plugin';
import swagger from '@fastify/swagger';
import swaggerUI from '@fastify/swagger-ui';
import { jsonSchemaTransform } from 'fastify-type-provider-zod';
import { env } from '../env';
import { SWAGGER_PROD_IGNORE_URLS } from '../constants';
import pkg from '../../package.json';

export const DOCS_ROUTE_PREFIX = '/docs';

export default fp(async (fastify) => {
  fastify.register(swagger, {
    hideUntagged: true,
    openapi: {
      openapi: '3.1.0',
      info: {
        title: 'Bitcoin/RGB++ Assets API',
        version: pkg.version,
      },
      security: [{ apiKey: [] }],
      components: {
        securitySchemes: {
          apiKey: {
            type: 'apiKey',
            name: 'Authorization',
            in: 'header',
            description: 'JWT token for authentication. Example: Bearer <token>',
          },
        },
      },
    },
    transform: jsonSchemaTransform,
    transformObject: ({ openapiObject }) => {
      if (env.NODE_ENV === 'production') {
        const { paths = {} } = openapiObject;
        openapiObject.paths = Object.entries(paths).reduce((acc, [path, methods]) => {
          if (SWAGGER_PROD_IGNORE_URLS.some((ignorePath) => path.startsWith(ignorePath))) {
            return acc;
          }
          return { ...acc, [path]: methods };
        }, {});
      }
      return openapiObject;
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
