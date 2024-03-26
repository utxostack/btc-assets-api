import fp from 'fastify-plugin';
import * as Sentry from '@sentry/node';
import TransactionManager from '../services/transaction';
import cron from 'fastify-cron';
import { Env } from '../env';

export default fp(async (fastify) => {
  try {
    const env: Env = fastify.container.resolve('env');

    // processing rgb++ ckb transaction
    const transactionManager: TransactionManager = fastify.container.resolve('transactionManager');
    fastify.addHook('onReady', async () => {
      transactionManager.startProcess({
        onActive: (job) => {
          fastify.log.info(`Job active: ${job.id}`);
        },
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
          cronTime: env.UNLOCKER_CRON_SCHEDULE,
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
