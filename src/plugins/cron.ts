import fp from 'fastify-plugin';
import * as Sentry from '@sentry/node';
import TransactionManager from '../services/transaction';

export default fp(async (fastify) => {
  try {
    const transactionManager: TransactionManager = fastify.container.resolve('transactionManager');
    fastify.addHook('onReady', async () => {
      transactionManager.startProcess({
        onCompleted: (job) => {
          fastify.log.info(`Job completed: ${job.id}`);
        },
      });
    });
    fastify.addHook('onClose', async () => {
      transactionManager.closeProcess();
    });
  } catch (err) {
    fastify.log.error(err);
    Sentry.captureException(err);
  }
});
