import { FastifyPluginCallback } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import { Server } from 'http';
import { env } from 'std-env';
import z from 'zod';

const generateRoute: FastifyPluginCallback<Record<never, never>, Server, ZodTypeProvider> = (fastify, _, done) => {
  fastify.post(
    '/generate',
    {
      schema: {
        tags: ['Token'],
        description: 'Generate a JWT token for the requester',
        body: z.object({
          app: z.string().default('my-app').describe('The app name of the requester'),
          domain: z
            .string()
            .default(env.DOMAIN ?? 'localhost')
            .describe(
              'The domain name of the requester, for CORS (needs to be consistent when calling origin request header)',
            ),
        }),
        response: {
          200: z.object({
            token: z
              .string()
              .describe(
                'The JWT token for the requester, add this to the Authorization(Bearer) header to authenticate the request',
              ),
          }),
        },
      },
    },
    async (request) => {
      const { app, domain } = request.body;
      const token = fastify.jwt.sign({ sub: app, aud: domain });
      return { token };
    },
  );
  done();
};

export default generateRoute;
