import { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import { FastifyPluginCallback } from 'fastify';
import { Server } from 'http';
import ElectrsAPI from '../../lib/electrs';
import Bitcoind from '../../lib/bitcoind';
import infoRoute from './info';
import blockRoutes from './block';
import transactionRoutes from './transaction';
import addressRoutes from './address';
import { env } from '../../env';

const bitcoinRoutes: FastifyPluginCallback<Record<never, never>, Server, TypeBoxTypeProvider> = (
  fastify,
  _,
  done,
) => {
  fastify.decorate('electrs', new ElectrsAPI(env.BITCOIN_ELECTRS_API_URL));
  fastify.decorate(
    'bitcoind',
    new Bitcoind(
      env.BITCOIN_JSON_RPC_URL,
      env.BITCOIN_JSON_RPC_USERNAME,
      env.BITCOIN_JSON_RPC_PASSWORD,
    ),
  );

  fastify.register(infoRoute);
  fastify.register(blockRoutes, { prefix: '/block' });
  fastify.register(transactionRoutes, { prefix: '/transaction' });
  fastify.register(addressRoutes, { prefix: '/address' });
  done();
};

export default bitcoinRoutes;
