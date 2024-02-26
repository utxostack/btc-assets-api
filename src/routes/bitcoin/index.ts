import { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import { FastifyPluginCallback } from 'fastify';
import { Server } from 'http';
import addressRoutes from './address';
import { env } from '../../env';
import ElectrsAPI from '../../lib/electrs';
import infoRoute from './info';
import transactionRoutes from './transaction';

const bitcoinRoutes: FastifyPluginCallback<Record<never, never>, Server, TypeBoxTypeProvider> = (
  fastify,
  _,
  done,
) => {
  fastify.decorate('electrs', new ElectrsAPI(env.BITCOIN_ELECTRS_API_URL));
  fastify.register(infoRoute);
  fastify.register(transactionRoutes, { prefix: '/transaction' });
  fastify.register(addressRoutes, { prefix: '/address' });
  done();
};

export default bitcoinRoutes;
