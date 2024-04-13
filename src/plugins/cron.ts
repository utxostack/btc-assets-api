import fp from 'fastify-plugin';
import * as Sentry from '@sentry/node';
import TransactionManager from '../services/transaction';
import cron from 'fastify-cron';
import { Env } from '../env';

function getSentryCheckIn(monitorSlug: string, crontab: string) {
  const checkInId = Sentry.captureCheckIn(
    {
      monitorSlug,
      status: 'in_progress',
    },
    {
      schedule: {
        type: 'crontab',
        value: crontab,
      },
      // create a new issue when 3 times missed or error check-ins are processed
      failure_issue_threshold: 3,
      // close the issue when 3 times ok check-ins are processed
      recovery_threshold: 3,
    },
  );
  return {
    ok: () => {
      Sentry.captureCheckIn({
        checkInId,
        monitorSlug,
        status: 'ok',
      });
    },
    error: () => {
      Sentry.captureCheckIn({
        checkInId,
        monitorSlug,
        status: 'error',
      });
    },
  };
}

export default fp(async (fastify) => {
  try {
    const env: Env = fastify.container.resolve('env');
    fastify.register(cron);

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
    const RETRY_MISSING_TRANSACTION_SCHEDULE = '*/5 * * * *';
    fastify.cron.createJob({
      name: 'retry-missing-transacitons',
      cronTime: RETRY_MISSING_TRANSACTION_SCHEDULE,
      onTick: async () => {
        const checkIn = getSentryCheckIn('retry-missing-transactions', RETRY_MISSING_TRANSACTION_SCHEDULE);
        try {
          await transactionManager.retryMissingTransactions();
          checkIn.ok();
        } catch (err) {
          checkIn.error();
          fastify.log.error(err);
          Sentry.captureException(err);
        }
      },
    });

    // processing unlock BTC_TIME_LOCK cells
    const unlocker = fastify.container.resolve('unlocker');
    const monitorSlug = env.UNLOCKER_MONITOR_SLUG;
    fastify.cron.createJob({
      name: 'unlock-btc-time-lock-cells',
      cronTime: env.UNLOCKER_CRON_SCHEDULE,
      onTick: async () => {
        const checkIn = getSentryCheckIn(monitorSlug, env.UNLOCKER_CRON_SCHEDULE);
        try {
          await unlocker.unlockCells();
          checkIn.ok();
        } catch (err) {
          checkIn.error();
          fastify.log.error(err);
          Sentry.captureException(err);
        }
      },
    });
  } catch (err) {
    fastify.log.error(err);
    Sentry.captureException(err);
  }
});
