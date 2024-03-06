import { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import { FastifyPluginCallback } from 'fastify';
import { Server } from 'http';
import container from '../../container';
import TransactionQueue from '../../services/transaction-queue';
import transactionRoutes from './transaction';

const rgbppRoutes: FastifyPluginCallback<Record<never, never>, Server, TypeBoxTypeProvider> = (fastify, _, done) => {
  fastify.decorate('transactionQueue', container.resolve<TransactionQueue>('transactionQueue'));
  fastify.register(transactionRoutes, { prefix: '/transaction' });
  done();
};

export default rgbppRoutes;
