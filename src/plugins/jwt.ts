import { FastifyReply, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';
import { env } from '../env';
import jwt from '@fastify/jwt';
import { JWT_IGNORE_URLS } from '../constants';
import * as Sentry from '@sentry/node';

export interface JwtPayload {
  sub: string;
  aud: string;
  jti: string;
}

export default fp(async (fastify) => {
  fastify.register(jwt, {
    secret: env.JWT_SECRET,
    trusted: (_, decodedToken) => {
      // forwards capability, skip token validation if jti is not present
      if (decodedToken.jti === undefined) {
        return true;
      }
      // denylist check, if token or sub or jti is in denylist, return false
      const denylist = env.JWT_DENYLIST;
      if (
        denylist.includes(decodedToken.jti) ||
        denylist.includes(decodedToken.sub) ||
        denylist.includes(decodedToken.jti)
      ) {
        return false;
      }
      return true;
    },
  });
  fastify.addHook('onRequest', async (request: FastifyRequest, reply: FastifyReply) => {
    if (
      request.method.toLowerCase() === 'options' ||
      JWT_IGNORE_URLS.some((prefix) => request.url.startsWith(prefix))
    ) {
      return;
    }
    try {
      await request.jwtVerify();
      const jwt = (await request.jwtDecode()) as JwtPayload;
      if (jwt) {
        Sentry.setTag('token.app', jwt.sub);
        Sentry.setTag('token.domain', jwt.aud);
      }
      if (!jwt.aud) {
        reply.status(401).send('Invalid audience');
        return;
      }

      const { origin, referer } = request.headers;
      let domain = '';
      if (origin) {
        domain = new URL(origin).hostname;
      } else if (referer) {
        domain = new URL(referer).hostname;
      }
      if (!domain || domain !== jwt.aud) {
        reply.status(401).send('Invalid request origin or referer');
      }
    } catch (err) {
      reply.status(401).send(err);
    }
  });
});
