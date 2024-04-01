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
    const monitorSlug = env.UNLOCKER_MONITOR_SLUG;
    fastify.register(cron, {
      jobs: [
        {
          name: 'unlock-btc-time-lock-cells',
          cronTime: env.UNLOCKER_CRON_SCHEDULE,
          onTick: async () => {
            const checkInId = Sentry.captureCheckIn(
              {
                monitorSlug,
                status: 'in_progress',
              },
              {
                schedule: {
                  type: 'crontab',
                  value: env.UNLOCKER_CRON_SCHEDULE,
                },
                // create a new issue when 3 times missed or error check-ins are processed
                failure_issue_threshold: 3,
                // close the issue when 3 times ok check-ins are processed
                recovery_threshold: 3,
              },
            );
            try {
              await unlocker.unlockCells();
              Sentry.captureCheckIn({
                checkInId,
                monitorSlug,
                status: 'ok',
              });
            } catch (err) {
              Sentry.captureCheckIn({
                checkInId,
                monitorSlug,
                status: 'error',
              });
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
