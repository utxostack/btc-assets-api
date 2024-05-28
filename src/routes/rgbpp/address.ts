import { FastifyPluginCallback, FastifyRequest } from 'fastify';
import { Server } from 'http';
import validateBitcoinAddress from '../../utils/validators';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import { Cell, Script, XUDTBalance } from './types';
import { blockchain } from '@ckb-lumos/base';
import z from 'zod';
import { serializeScript } from '@nervosnetwork/ckb-sdk-utils';
import { Env } from '../../env';
import { getXudtTypeScript, isTypeAssetSupported, leToU128 } from '@rgbpp-sdk/ckb';
import { BI } from '@ckb-lumos/lumos';
import { computeScriptHash } from '@ckb-lumos/lumos/utils';

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
        return rgbppCache.filter((cell) => {
          if (!cell.cellOutput.type) {
            return false;
          }
          // if typeScript.args is empty, only compare codeHash and hashType
          if (!typeScript.args) {
            const script = { ...cell.cellOutput.type, args: '' };
            return serializeScript(script) === serializeScript(typeScript);
          }
          return serializeScript(cell.cellOutput.type) === serializeScript(typeScript);
        });
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
      return getRgbppAssetsCells(btc_address, typeScript, no_cache);
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
            xudt: z.array(XUDTBalance),
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
      const cells = await getRgbppAssetsCells(btc_address, typeScript, no_cache);

      const scripts = fastify.ckb.getScripts();
      if (serializeScript({ ...typeScript, args: '' }) !== serializeScript(scripts.XUDT)) {
        throw fastify.httpErrors.badRequest('Unsupported type asset');
      }

      const infoCellDataMap = new Map();
      const allInfoCellTxs = await fastify.ckb.getAllInfoCellTxs();
      const xudtBalances: Record<string, XUDTBalance> = {};

      for await (const cell of cells) {
        const type = cell.cellOutput.type!;
        const typeHash = computeScriptHash(type);
        if (!infoCellDataMap.has(typeHash)) {
          const infoCellData = fastify.ckb.getInfoCellData(allInfoCellTxs, type);
          infoCellDataMap.set(typeHash, infoCellData);
        }
        const infoCellData = infoCellDataMap.get(typeHash);
        const amount = BI.from(leToU128(cell.data)).toHexString();
        if (infoCellData) {
          if (!xudtBalances[typeHash]) {
            xudtBalances[typeHash] = {
              ...infoCellData,
              typeHash,
              amount,
            };
          } else {
            xudtBalances[typeHash].amount = BI.from(xudtBalances[typeHash].amount).add(BI.from(amount)).toHexString();
          }
        }
      }

      return {
        address: btc_address,
        xudt: Object.values(xudtBalances),
      };
    },
  );

  done();
};

export default addressRoutes;
