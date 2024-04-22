import fp from 'fastify-plugin';
import { env } from '../env';

export default fp(async (fastify) => {
  try {
    fastify.addHook('onRequest', async (request, reply) => {
      const ip = request.ip;
      fastify.log.info(`IP: ${ip}`);
      if (env.IP_BLOCKLIST.includes(ip)) {
        reply.code(403).send('Forbidden');
        return;
      }
    });
  } catch (err) {
    fastify.log.error(err);
    fastify.Sentry.captureException(err);
  }
});
