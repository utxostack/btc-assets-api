import { Type, TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import { FastifyPluginCallback } from 'fastify';
import { Server } from 'http';
import { Balance, BalanceType, Transaction, UTXOType } from './types';

const addressRoutes: FastifyPluginCallback<Record<never, never>, Server, TypeBoxTypeProvider> = (
  fastify,
  _,
  done,
) => {
  fastify.get(
    '/:address/balance',
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

  fastify.get(
    '/:address/unspent',
    {
      schema: {
        params: Type.Object({
          address: Type.String(),
        }),
        response: {
          200: Type.Array(
            Type.Object({
              txid: Type.String(),
              vout: Type.Number(),
              value: Type.Number(),
              status: Type.Object({
                confirmed: Type.Boolean(),
                block_height: Type.Number(),
                block_hash: Type.String(),
                block_time: Type.Number(),
              }),
            }),
          ),
        },
      },
    },
    async function (request) {
      const { address } = request.params;
      const utxos = await fastify.electrs.getUtxoByAddress(address);
      return utxos;
    },
  );

  fastify.get(
    '/:address/txs',
    {
      schema: {
        params: Type.Object({
          address: Type.String(),
        }),
        response: {
          200: Type.Array(Transaction),
        }
      },
    },
    async (request) => {
      const { address } = request.params;
      const txs = await fastify.electrs.getTransactionsByAddress(address);
      return txs;
    },
  );

  done();
};

export default addressRoutes;
