import { FastifyReply, FastifyRequest } from 'fastify';
import { env } from '../env';

export default async function adminAuthorize(request: FastifyRequest, reply: FastifyReply) {
  const { authorization } = request.headers;
  if (!authorization) {
    reply.code(401).send({ error: 'Unauthorized' });
    return;
  }

  const [scheme, token] = authorization.split(' ');
  if (scheme.toLowerCase() !== 'basic') {
    reply.code(401).send({ error: 'Unauthorized' });
    return;
  }

  const [username, password] = Buffer.from(token, 'base64').toString().split(':');
  if (username !== env.ADMIN_USERNAME || password !== env.ADMIN_PASSWORD) {
    reply.code(401).send({ error: 'Unauthorized' });
    return;
  }
}
