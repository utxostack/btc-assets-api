import { FastifyReply, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';
import { env } from '../env';
import jwt from '@fastify/jwt';
import { JWT_IGNORE_URLS } from '../constants';
import { HttpStatusCode } from 'axios';

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
      const token = fastify.jwt.sign(decodedToken);
      if (
        denylist.includes(token) ||
        denylist.includes(decodedToken.sub) ||
        denylist.includes(decodedToken.aud) ||
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
        reply.sentryTransaction?.setAttribute('token.id', jwt.jti);
        reply.sentryTransaction?.setAttribute('token.app', jwt.sub);
        reply.sentryTransaction?.setAttribute('token.domain', jwt.aud);
      }
      if (!jwt.aud) {
        reply.status(HttpStatusCode.Unauthorized).send('Invalid audience');
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
        reply.status(HttpStatusCode.Unauthorized).send('Invalid request origin or referer');
      }
    } catch (err) {
      reply.status(HttpStatusCode.Unauthorized).send(err);
    }
  });
});
