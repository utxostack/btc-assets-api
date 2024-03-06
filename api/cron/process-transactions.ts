import pino from 'pino';
import container from '../../src/container';
import TransactionQueue from '../../src/services/transaction-queue';

const VERCEL_MAX_DURATION = 60 * 1000;

export default async () => {
  const logger = container.resolve<pino.BaseLogger>('logger');
  const transactionQueue = container.resolve<TransactionQueue>('transactionQueue');
  await Promise.race([
    transactionQueue.startProcess((job) => {
      logger.info(`Job completed: ${job.id}`);
    }),
    new Promise((resolve) => setTimeout(resolve, VERCEL_MAX_DURATION)),
  ]);
  await transactionQueue.pauseProcess();
  await transactionQueue.close();
};
