import { randomUUID } from 'crypto';
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
            .default(env.DOMAIN ?? process.env.VERCEL_BRANCH_URL ?? 'localhost')
            .describe(
              'The domain name of the requester, for CORS (needs to be consistent when calling origin request header)',
            ),
        }),
        response: {
          200: z.object({
            id: z.string().describe('The unique identifier of the JWT token'),
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
      const uuid = randomUUID();

      try {
        // Ensure the domain is a valid URL and extract the host
        const url = domain.startsWith('http') ? domain : `https://${domain}`;
        const { host, pathname } = new URL(url);
        if (pathname !== '/') {
          throw new Error('Must be a valid domain without path');
        }

        const token = fastify.jwt.sign({ sub: app, aud: host, jti: uuid });
        return { id: uuid, token };
      } catch (e) {
        fastify.Sentry.captureException(e);
        throw new Error('Failed to generate token: ' + (e as Error).message);
      }
    },
  );
  done();
};

export default generateRoute;
