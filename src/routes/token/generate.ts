import { Type, TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import { FastifyPluginCallback } from 'fastify';
import { Server } from 'http';

const generateRoute: FastifyPluginCallback<Record<never, never>, Server, TypeBoxTypeProvider> = (
  fastify,
  _,
  done,
) => {
  fastify.post(
    '/generate',
    {
      schema: {
        body: Type.Object({
          app: Type.String(),
          domain: Type.String(),
        }),
        response: {
          200: Type.Object({
            token: Type.String(),
          })
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
