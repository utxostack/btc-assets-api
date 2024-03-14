import fp from 'fastify-plugin';
import * as Sentry from '@sentry/node';
import TransactionManager from '../services/transaction';
import cron from 'fastify-cron';

export default fp(async (fastify) => {
  try {
    // processing rgb++ ckb transaction
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

    // processing unlock BTC_TIME_LOCK cells
    const unlocker = fastify.container.resolve('unlocker');
    fastify.register(cron, {
      jobs: [
        {
          name: 'unlock-btc-time-lock-cells',
          cronTime: '*/10 * * * *',
          onTick: async () => {
            try {
              await unlocker.unlockCells();
            } catch (err) {
              fastify.log.error(err);
              Sentry.captureException(err);
            }
          },
        },
      ],
    });
  } catch (err) {
    fastify.log.error(err);
    Sentry.captureException(err);
  }
});
