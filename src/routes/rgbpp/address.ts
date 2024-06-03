import { FastifyPluginCallback, FastifyRequest } from 'fastify';
import { Server } from 'http';
import validateBitcoinAddress from '../../utils/validators';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import { Cell, Script, XUDTBalance } from './types';
import { blockchain } from '@ckb-lumos/base';
import z from 'zod';
import { Env } from '../../env';
import { getXudtTypeScript, isScriptEqual, isTypeAssetSupported } from '@rgbpp-sdk/ckb';
import { BI } from '@ckb-lumos/lumos';
import { UTXO } from '../../services/bitcoin/schema';

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
   * Get UTXOs by btc address
   */
  async function getUxtos(btc_address: string, no_cache?: string) {
    const utxos = await fastify.utxoSyncer.getUtxosByAddress(btc_address, no_cache === 'true');
    if (env.UTXO_SYNC_DATA_CACHE_ENABLE) {
      await fastify.utxoSyncer.enqueueSyncJob(btc_address);
    }
    return utxos;
  }

  /**
   * Get RGB++ assets by btc address
   */
  async function getRgbppAssetsCells(btc_address: string, utxos: UTXO[], no_cache?: string) {
    const rgbppUtxoCellsPairs = await fastify.rgbppCollector.getRgbppUtxoCellsPairs(
      btc_address,
      utxos,
      no_cache === 'true',
    );
    if (env.RGBPP_COLLECT_DATA_CACHE_ENABLE) {
      await fastify.rgbppCollector.enqueueCollectJob(btc_address, utxos);
    }
    const cells = rgbppUtxoCellsPairs.map((pair) => pair.cells).flat();
    return cells;
  }

  /**
   * Filter cells by type script
   */
  async function filterCellsByTypeScript(cells: Cell[], typeScript: Script) {
    return cells.filter((cell) => {
      if (!cell.cellOutput.type) {
        return false;
      }
      // if typeScript.args is empty, only compare codeHash and hashType
      if (!typeScript.args) {
        const script = { ...cell.cellOutput.type, args: '' };
        return isScriptEqual(script, typeScript);
      }
      return isScriptEqual(cell.cellOutput.type, typeScript);
    });
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
      const utxos = await getUxtos(btc_address, no_cache);
      const cells = await getRgbppAssetsCells(btc_address, utxos, no_cache);
      const typeScript = getTypeScript(request);
      return typeScript ? filterCellsByTypeScript(cells, typeScript) : cells;
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
      const scripts = fastify.ckb.getScripts();
      if (isScriptEqual({ ...typeScript, args: '' }, scripts.XUDT)) {
        throw fastify.httpErrors.badRequest('Unsupported type asset');
      }

      const utxos = await getUxtos(btc_address, no_cache);
      const xudtBalances: Record<string, XUDTBalance> = {};

      let cells = await getRgbppAssetsCells(btc_address, utxos, no_cache);
      cells = typeScript ? await filterCellsByTypeScript(cells, typeScript) : cells;
      const availableXudtBalances = await fastify.rgbppCollector.getRgbppBalanceByCells(cells);
      Object.keys(availableXudtBalances).forEach((key) => {
        const { amount, ...xudtInfo } = availableXudtBalances[key];
        xudtBalances[key] = {
          ...xudtInfo,
          total_amount: amount,
          available_amount: amount,
          pending_amount: '0x0',
        };
      });

      const pendingUtxos = utxos.filter((utxo) => !utxo.status.confirmed);
      const pendingTxids = Array.from(new Set(pendingUtxos.map((utxo) => utxo.txid)));
      let pendingOutputCells = await fastify.transactionProcessor.getPendingOuputCellsByTxids(pendingTxids);
      pendingOutputCells = typeScript
        ? await filterCellsByTypeScript(pendingOutputCells, typeScript)
        : pendingOutputCells;
      const pendingXudtBalances = await fastify.rgbppCollector.getRgbppBalanceByCells(pendingOutputCells);
      Object.values(pendingXudtBalances).forEach(({ amount, typeHash }) => {
        xudtBalances[typeHash].pending_amount = BI.from(xudtBalances[typeHash].pending_amount)
          .add(BI.from(amount))
          .toHexString();
        xudtBalances[typeHash].total_amount = BI.from(xudtBalances[typeHash].total_amount)
          .add(BI.from(amount))
          .toHexString();
      });

      return {
        address: btc_address,
        xudt: Object.values(xudtBalances),
      };
    },
  );

  done();
};

export default addressRoutes;
