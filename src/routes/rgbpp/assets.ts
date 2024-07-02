import { FastifyPluginCallback } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import { Server } from 'http';
import z from 'zod';
import { Cell, XUDTTypeInfo } from './types';
import { UTXO } from '../../services/bitcoin/schema';
import { getTypeScript } from '../../utils/typescript';
import { Env } from '../../env';
import { isUDTTypeSupported } from '@rgbpp-sdk/ckb';
import { computeScriptHash } from '@ckb-lumos/lumos/utils';

const assetsRoute: FastifyPluginCallback<Record<never, never>, Server, ZodTypeProvider> = (fastify, _, done) => {
  const env: Env = fastify.container.resolve('env');

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
          200: z.array(
            Cell.merge(
              z.object({
                typeHash: z.string().optional(),
              }),
            ),
          ),
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
      return batchCells.flat().map((cell) => {
        const typeHash = cell.cellOutput.type ? computeScriptHash(cell.cellOutput.type) : undefined;
        return {
          ...cell,
          typeHash,
        };
      });
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
          200: z.array(
            Cell.merge(
              z.object({
                typeHash: z.string().optional(),
              }),
            ),
          ),
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
      return batchCells.flat().map((cell) => {
        const typeHash = cell.cellOutput.type ? computeScriptHash(cell.cellOutput.type) : undefined;
        return {
          ...cell,
          typeHash,
        };
      });
    },
  );

  fastify.get(
    '/type',
    {
      schema: {
        description: 'Get RGB++ assets type info by typescript',
        tags: ['RGB++'],
        querystring: z.object({
          type_script: z.string().optional(),
        }),
        response: {
          200: z
            .object({
              type: z.literal('xudt'),
            })
            .merge(XUDTTypeInfo)
            .nullable(),
        },
      },
    },
    async (request) => {
      const isMainnet = env.NETWORK === 'mainnet';
      const typeScript = getTypeScript(request.query.type_script);
      if (!typeScript) {
        return null;
      }
      if (isUDTTypeSupported(typeScript, isMainnet)) {
        const infoCell = await fastify.ckb.getInfoCellData(typeScript);
        const typeHash = computeScriptHash(typeScript);
        if (!infoCell) {
          return null;
        }
        return {
          type: 'xudt' as const,
          type_hash: typeHash,
          type_script: typeScript,
          ...infoCell,
        };
      }
      return null;
    },
  );

  done();
};

export default assetsRoute;
