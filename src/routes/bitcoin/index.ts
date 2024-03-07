import { FastifyPluginCallback } from 'fastify';
import { Server } from 'http';
import ElectrsAPI from '../../services/electrs';
import Bitcoind from '../../services/bitcoind';
import infoRoute from './info';
import blockRoutes from './block';
import transactionRoutes from './transaction';
import addressRoutes from './address';
import container from '../../container';
import { ZodTypeProvider } from 'fastify-type-provider-zod';

const bitcoinRoutes: FastifyPluginCallback<Record<never, never>, Server, ZodTypeProvider> = (fastify, _, done) => {
  fastify.decorate('electrs', container.resolve<ElectrsAPI>('electrs'));
  fastify.decorate('bitcoind', container.resolve<Bitcoind>('bitcoind'));

  fastify.register(infoRoute);
  fastify.register(blockRoutes, { prefix: '/block' });
  fastify.register(transactionRoutes, { prefix: '/transaction' });
  fastify.register(addressRoutes, { prefix: '/address' });
  done();
};

export default bitcoinRoutes;
