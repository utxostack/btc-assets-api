import pino from 'pino';
import container from '../../src/container';
import TransactionManager from '../../src/services/transaction';

const VERCEL_MAX_DURATION = 60 * 1000;

export default async () => {
  const logger = container.resolve<pino.BaseLogger>('logger');
  const transactionManager: TransactionManager = container.resolve('transactionManager');
  await Promise.race([
    transactionManager.startProcess({
      onCompleted: (job) => {
        logger.info(`Job completed: ${job.id}`);
      },
    }),
    new Promise((resolve) => setTimeout(resolve, VERCEL_MAX_DURATION)),
  ]);
  await transactionManager.pauseProcess();
  await transactionManager.closeProcess();
};
