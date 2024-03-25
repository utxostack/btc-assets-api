import pino from 'pino';
import { FastifyPluginCallback } from 'fastify';
import { Server } from 'http';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import container from '../../container';
import TransactionManager from '../../services/transaction';

const transactionsCronRoute: FastifyPluginCallback<Record<never, never>, Server, ZodTypeProvider> = (fastify, _, done) => {
  fastify.get('/transactions', async () => {
    const logger = container.resolve<pino.BaseLogger>('logger');
    const transactionManager: TransactionManager = container.resolve('transactionManager');
    await Promise.race([
      transactionManager.startProcess({
        onActive: (job) => {
          logger.info(`Job active: ${job.id}`);
        },
        onCompleted: (job) => {
          logger.info(`Job completed: ${job.id}`);
        },
      }),
      new Promise((resolve) => setTimeout(resolve, 59_000)),
    ]);
    await transactionManager.pauseProcess();
    await transactionManager.closeProcess();
  });
  done();
};

export default transactionsCronRoute;
