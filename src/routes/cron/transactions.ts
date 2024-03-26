import pino from 'pino';
import { FastifyPluginCallback } from 'fastify';
import { Server } from 'http';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import container from '../../container';
import TransactionManager from '../../services/transaction';

const transactionsCronRoute: FastifyPluginCallback<Record<never, never>, Server, ZodTypeProvider> = (
  fastify,
  _,
  done,
) => {
  fastify.get(
    '/transactions',
    {
      schema: {
        tags: ['Cron Task'],
        description: 'Run RGB++ CKB transaction cron task, used for serverless deployment',
      },
    },
    async () => {
      const logger = container.resolve<pino.BaseLogger>('logger');
      const transactionManager: TransactionManager = container.resolve('transactionManager');
      await new Promise((resolve) => {
        setTimeout(resolve, 59_000);
        transactionManager.startProcess({
          onActive: (job) => {
            logger.info(`Job active: ${job.id}`);
          },
          onCompleted: (job) => {
            logger.info(`Job completed: ${job.id}`);
          },
        });
      });
      await transactionManager.pauseProcess();
      await transactionManager.closeProcess();
    },
  );
  done();
};

export default transactionsCronRoute;
