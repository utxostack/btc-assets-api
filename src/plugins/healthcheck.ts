import healthcheck from 'fastify-custom-healthcheck';
import fp from 'fastify-plugin';
import TransactionManager from '../services/transaction';
import Paymaster from '../services/paymaster';

export default fp(async (fastify) => {
  await fastify.register(healthcheck, {
    path: '/healthcheck',
    exposeFailure: true,
    schema: false,
  });

  fastify.addHealthCheck('redis', async () => {
    const redis = fastify.container.resolve('redis');
    await redis.ping();
  });

  fastify.addHealthCheck('queue', async () => {
    const transactionManager: TransactionManager = fastify.container.resolve('transactionManager');
    const counts = await transactionManager.getQueueJobCounts();
    if (!counts) {
      throw new Error('Transaction queue is not available');
    }
    const isRunning = await transactionManager.isWorkerRunning();
    if (!isRunning) {
      throw new Error('Transaction worker is not running');
    }
  });

  fastify.addHealthCheck('paymaster', async () => {
    const paymaster: Paymaster = fastify.container.resolve('paymaster');
    const count = await paymaster.getPaymasterCellCount();
    if (!count) {
      throw new Error('Paymaster cell queue is empty');
    }
  });
});
