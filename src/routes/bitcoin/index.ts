import { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import { FastifyPluginCallback } from 'fastify';
import { Server } from 'http';
import ElectrsAPI from '../../services/electrs';
import Bitcoind from '../../services/bitcoind';
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
  const electrs = new ElectrsAPI(env.BITCOIN_ELECTRS_API_URL);
  electrs.setLogger(fastify.log);
  fastify.decorate('electrs', electrs);

  const bitcoind = new Bitcoind(
    env.BITCOIN_JSON_RPC_URL,
    env.BITCOIN_JSON_RPC_USERNAME,
    env.BITCOIN_JSON_RPC_PASSWORD,
  );
  bitcoind.setLogger(fastify.log);
  fastify.decorate('bitcoind', bitcoind);

  fastify.register(infoRoute);
  fastify.register(blockRoutes, { prefix: '/block' });
  fastify.register(transactionRoutes, { prefix: '/transaction' });
  fastify.register(addressRoutes, { prefix: '/address' });
  done();
};

export default bitcoinRoutes;
