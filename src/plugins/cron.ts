import fp from 'fastify-plugin';
import * as Sentry from '@sentry/node';
import TransactionQueue from '../services/transaction-queue';

export default fp(async (fastify) => {
  try {
    const transactionQueue: TransactionQueue = fastify.container.resolve('transactionQueue');
    fastify.addHook('onReady', async () => {
      transactionQueue.startProcess((job) => {
        fastify.log.info(`Job completed: ${job.id}`);
      });
    });
    fastify.addHook('onClose', async () => {
      transactionQueue.close();
    });
  } catch (err) {
    fastify.log.error(err);
    Sentry.captureException(err);
  }
});
