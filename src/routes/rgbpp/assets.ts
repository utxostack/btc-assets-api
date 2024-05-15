import { FastifyPluginCallback } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import { Server } from 'http';
import z from 'zod';
import { Cell } from './types';
import { UTXO } from '../../services/bitcoin/schema';

const assetsRoute: FastifyPluginCallback<Record<never, never>, Server, ZodTypeProvider> = (fastify, _, done) => {
  fastify.get(
    '/:btc_txid',
    {
      schema: {
        description: `Get RGB++ assets by BTC txid.`,
        tags: ['RGB++'],
        params: z.object({
          btc_txid: z.string(),
        }),
        response: {
          200: z.array(Cell),
        },
      },
    },
    async (request) => {
      const { btc_txid } = request.params;
      const transaction = await fastify.bitcoin.getTx({ txid: btc_txid });

      const utxos = transaction.vout.map((vout, index) => {
        return {
          txid: btc_txid,
          vout: index,
          value: vout.value,
          status: {
            confirmed: true,
          },
        } as UTXO;
      });

      const batchCells = await fastify.rgbppCollector.getRgbppCellsByBatchRequest(utxos);
      return batchCells.flat();
    },
  );

  fastify.get(
    '/:btc_txid/:vout',
    {
      schema: {
        description: 'Get RGB++ assets by btc txid and vout',
        tags: ['RGB++'],
        params: z.object({
          btc_txid: z.string(),
          vout: z.coerce.number(),
        }),
        response: {
          200: z.array(Cell),
        },
      },
    },
    async (request) => {
      const { btc_txid, vout } = request.params;
      const utxo: UTXO = {
        txid: btc_txid,
        vout,
        // We don't need the value here, so we just set it to 0
        value: 0,
        status: {
          confirmed: true,
        },
      };

      const batchCells = await fastify.rgbppCollector.getRgbppCellsByBatchRequest([utxo]);
      return batchCells.flat();
    },
  );

  done();
};

export default assetsRoute;
