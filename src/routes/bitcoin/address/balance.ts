import { Type, TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import { FastifyPluginCallback } from 'fastify';
import { Server } from 'http';
import { Unspent } from '../../../lib/bitcoind';

const balanceRoute: FastifyPluginCallback<Record<never, never>, Server, TypeBoxTypeProvider> = (
  fastify,
  _,
  done,
) => {
  fastify.get(
    '/balance',
    {
      schema: {
        params: Type.Object({
          address: Type.String(),
        }),
      },
    },
    async function (request) {
      const { address } = request.params;
      const addressInfo = await fastify.bitcoind.getAddressInfo(address);
      if (!addressInfo.isMine) {
        const descriptor = await fastify.bitcoind.getDescriptorInfo(`addr(${address})`);
        await fastify.bitcoind.importDescriptors([descriptor]);
      }
      const unspent = await fastify.bitcoind.listUnspent(address);
      const balance = unspent.reduce((acc: number, u: Unspent) => acc + u.amount, 0);
      return balance;
    },
  );
  done();
};

export default balanceRoute;
