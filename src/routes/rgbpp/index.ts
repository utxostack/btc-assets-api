import { FastifyPluginCallback } from 'fastify';
import { Server } from 'http';
import container from '../../container';
import TransactionQueue from '../../services/transaction-queue';
import transactionRoutes from './transaction';
import { ZodTypeProvider } from 'fastify-type-provider-zod';

const rgbppRoutes: FastifyPluginCallback<Record<never, never>, Server, ZodTypeProvider> = (fastify, _, done) => {
  fastify.decorate('transactionQueue', container.resolve<TransactionQueue>('transactionQueue'));
  fastify.register(transactionRoutes, { prefix: '/transaction' });
  done();
};

export default rgbppRoutes;
