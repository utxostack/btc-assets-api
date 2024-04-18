import { FastifyPluginCallback } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import { Server } from 'http';
import z from 'zod';
import { env } from '../../env';

const jobRoutes: FastifyPluginCallback<Record<never, never>, Server, ZodTypeProvider> = (fastify, _, done) => {
  fastify.post(
    '/retry-all-failed',
    {
      schema: {
        description: 'Retry all failed transactions.',
        body: z.object({
          max_attempts: z.coerce.number().optional().default(env.TRANSACTION_QUEUE_JOB_ATTEMPTS),
        }),
        response: {
          200: z.array(
            z.object({
              txid: z.string().describe('The list of BTC txids that have been retried'),
              state: z.string().describe('The state of the transactions'),
            }),
          ),
        },
      },
    },
    async (request) => {
      const { max_attempts } = request.body;
      const results = await fastify.transactionManager.retryAllFailedJobs(max_attempts);
      return results;
    },
  );

  done();
};

export default jobRoutes;
