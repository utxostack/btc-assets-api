import { Type, TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import { FastifyPluginCallback } from 'fastify';
import { Server } from 'http';
import { Balance, BalanceType, UTXOType } from '../types';

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
        response: {
          200: Balance,
        },
      },
    },
    async (request) => {
      const { address } = request.params;
      const utxos = await fastify.electrs.getUtxoByAddress(address);
      return utxos.reduce(
        (acc: BalanceType, utxo: UTXOType) => {
          if (utxo.status.confirmed) {
            acc.satoshi += utxo.value;
          } else {
            acc.pendingSatoshi += utxo.value;
          }
          return acc;
        },
        {
          address,
          satoshi: 0,
          pendingSatoshi: 0,
          utxoCount: utxos.length,
        },
      );
    },
  );
  done();
};

export default balanceRoute;
