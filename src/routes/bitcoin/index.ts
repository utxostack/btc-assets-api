import { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import { FastifyPluginCallback } from 'fastify';
import { Server } from 'http';
import addressRoutes from './address';
import Bitcoind from '../../lib/bitcoind';
import { env } from '../../env';

const bitcoinRoutes: FastifyPluginCallback<Record<never, never>, Server, TypeBoxTypeProvider> = (
  fastify,
  _,
  done,
) => {
  fastify.decorate(
    'bitcoind',
    new Bitcoind(
      env.BITCOIN_JSON_RPC_URL,
      env.BITCOIN_JSON_RPC_USERNAME,
      env.BITCOIN_JSON_RPC_PASSWORD,
    ),
  );

  fastify.register(addressRoutes, { prefix: '/address/:address' });
  done();
};

export default bitcoinRoutes;
