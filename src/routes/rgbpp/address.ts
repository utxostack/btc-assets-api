import { FastifyPluginCallback, FastifyRequest } from 'fastify';
import { Server } from 'http';
import validateBitcoinAddress from '../../utils/validators';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import { Cell, Script, XUDTBalances } from './types';
import { blockchain } from '@ckb-lumos/base';
import z from 'zod';
import { serializeScript } from '@nervosnetwork/ckb-sdk-utils';
import { Env } from '../../env';
import { getXudtTypeScript, isTypeAssetSupported, leToU128 } from '@rgbpp-sdk/ckb';
import { BI } from '@ckb-lumos/lumos';
import { groupBy } from 'lodash';

const addressRoutes: FastifyPluginCallback<Record<never, never>, Server, ZodTypeProvider> = (fastify, _, done) => {
  const env: Env = fastify.container.resolve('env');

  fastify.addHook('preHandler', async (request) => {
    const { btc_address } = request.params as { btc_address: string };
    const valid = validateBitcoinAddress(btc_address);
    if (!valid) {
      throw fastify.httpErrors.badRequest('Invalid bitcoin address');
    }
  });

  /**
   * Get type script from request query
   */
  function getTypeScript(request: FastifyRequest) {
    const { type_script } = request.query as { type_script: string | Script };
    let typeScript: Script | undefined = undefined;
    if (type_script) {
      if (typeof type_script === 'string') {
        typeScript = blockchain.Script.unpack(type_script);
      } else {
        typeScript = type_script;
      }
    }
    return typeScript;
  }

  /**
   * Get RGB++ assets by btc address
   */
  async function getRgbppAssetsCells(btc_address: string, typeScript?: Script, no_cache?: string) {
    let utxosCache = null;
    if (env.UTXO_SYNC_DATA_CACHE_ENABLE) {
      if (no_cache !== 'true') {
        utxosCache = await fastify.utxoSyncer.getUTXOsFromCache(btc_address);
      }
      await fastify.utxoSyncer.enqueueSyncJob(btc_address);
    }
    const utxos = utxosCache ? utxosCache : await fastify.bitcoin.getAddressTxsUtxo({ address: btc_address });

    let rgbppCache = null;
    if (env.RGBPP_COLLECT_DATA_CACHE_ENABLE) {
      if (no_cache !== 'true') {
        rgbppCache = await fastify.rgbppCollector.getRgbppCellsFromCache(btc_address);
      }
      await fastify.rgbppCollector.enqueueCollectJob(btc_address, utxos);
    }

    if (rgbppCache) {
      fastify.log.debug(`[RGB++] get cells from cache: ${btc_address}`);
      if (typeScript) {
        return rgbppCache.filter(
          (cell) =>
            cell.cellOutput.type &&
            serializeScript({
              ...cell.cellOutput.type,
              args: '',
            }) === serializeScript(typeScript!),
        );
      }
      return rgbppCache;
    }

    const rgbppUtxoCellsParis = await fastify.rgbppCollector.collectRgbppUtxoCellsPairs(utxos, typeScript);
    const cells = rgbppUtxoCellsParis.map((pair) => pair.cells).flat();
    return cells;
  }

  fastify.get(
    '/:btc_address/assets',
    {
      schema: {
        description: 'Get RGB++ assets by btc address',
        tags: ['RGB++'],
        params: z.object({
          btc_address: z.string(),
        }),
        querystring: z.object({
          type_script: Script.or(z.string())
            .optional()
            .describe(
              `
              type script to filter cells

              two ways to provide:
              - as a object: 'encodeURIComponent(JSON.stringify({"codeHash":"0x...", "args":"0x...", "hashType":"type"}))'
              - as a hex string: '0x...' (You can pack by @ckb-lumos/codec blockchain.Script.pack({ "codeHash": "0x...", ... }))
            `,
            ),
          no_cache: z
            .enum(['true', 'false'])
            .default('false')
            .describe('Whether to disable cache to get RGB++ assets, default is false'),
        }),
        response: {
          200: z.array(Cell),
        },
      },
    },
    async (request) => {
      const { btc_address } = request.params;
      const { no_cache } = request.query;
      const typeScript = getTypeScript(request);
      return getRgbppAssetsCell(btc_address, typeScript, no_cache);
    },
  );

  fastify.get(
    '/:btc_address/balance',
    {
      schema: {
        description: 'Get RGB++ balance by btc address, support xUDT only for now',
        tags: ['RGB++'],
        params: z.object({
          btc_address: z.string(),
        }),
        querystring: z.object({
          type_script: Script.or(z.string())
            .describe(
              `
              type script to filter cells

              two ways to provide:
              - as a object: 'encodeURIComponent(JSON.stringify({"codeHash":"0x...", "args":"0x...", "hashType":"type"}))'
              - as a hex string: '0x...' (You can pack by @ckb-lumos/codec blockchain.Script.pack({ "codeHash": "0x...", ... }))
            `,
            )
            .default(getXudtTypeScript(env.NETWORK === 'mainnet')),
          no_cache: z
            .enum(['true', 'false'])
            .default('false')
            .describe('Whether to disable cache to get RGB++ assets, default is false'),
        }),
        response: {
          200: z.object({
            address: z.string(),
            xudt: XUDTBalances,
          }),
        },
      },
    },
    async (request) => {
      const { btc_address } = request.params;
      const { no_cache } = request.query;

      const typeScript = getTypeScript(request);
      if (!typeScript || !isTypeAssetSupported(typeScript, env.NETWORK === 'mainnet')) {
        throw fastify.httpErrors.badRequest('Unsupported type asset');
      }
      const cells = await getRgbppAssetsCell(btc_address, typeScript, no_cache);

      const scripts = fastify.ckb.getScripts();
      if (serializeScript({ ...typeScript, args: '' }) !== serializeScript(scripts.XUDT)) {
        throw fastify.httpErrors.badRequest('Unsupported type asset');
      }

      let balances: XUDTBalances = [];
      const infoCellDataMap = new Map();
      const allInfoCellTxs = await fastify.ckb.getAllInfoCellTxs();
      for (const cell of cells) {
        const type = cell.cellOutput.type!;
        const serializedType = serializeScript(type);
        if (!infoCellDataMap.has(serializedType)) {
          const infoCellData = fastify.ckb.getInfoCellData(allInfoCellTxs, type);
          infoCellDataMap.set(serializedType, infoCellData);
        }
        const infoCellData = infoCellDataMap.get(serializedType);
        const amount = BI.from(leToU128(cell.data)).toHexString();

        if (!infoCellData) {
          continue;
        }
        balances.push({
          ...infoCellData,
          amount,
        });
      }

      const balanceGroups = groupBy(balances, 'typeHash');
      balances = Object.keys(balanceGroups).map((typeHash) => {
        const group = balanceGroups[typeHash];
        const sum = group.reduce((sum, { amount }) => sum.add(BI.from(amount)), BI.from(0));
        return {
          ...group[0],
          amount: BI.from(sum).toHexString(),
        };
      });
      console.log(balances);
      return {
        address: btc_address,
        xudt: balances,
      };
    },
  );

  done();
};

export default addressRoutes;
