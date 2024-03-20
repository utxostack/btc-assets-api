import { FastifyPluginCallback } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import { Server } from 'http';
import z from 'zod';

const generateRoute: FastifyPluginCallback<Record<never, never>, Server, ZodTypeProvider> = (fastify, _, done) => {
  fastify.post(
    '/generate',
    {
      schema: {
        body: z.object({
          app: z.string(),
          domain: z.string(),
        }),
        response: {
          200: z.object({
            token: z.string(),
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
