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
        return serializeScript(script) === serializeScript(typeScript);
      }
      return serializeScript(cell.cellOutput.type) === serializeScript(typeScript);
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

      const utxos = await getUxtos(btc_address, no_cache);
      let cells = await getRgbppAssetsCells(btc_address, utxos, no_cache);
      cells = typeScript ? await filterCellsByTypeScript(cells, typeScript) : cells;

      const scripts = fastify.ckb.getScripts();
      if (serializeScript({ ...typeScript, args: '' }) !== serializeScript(scripts.XUDT)) {
        throw fastify.httpErrors.badRequest('Unsupported type asset');
      }

      const infoCellDataMap = new Map();
      const getInfoCellData = async (type: Script) => {
        const typeHash = computeScriptHash(type);
        if (!infoCellDataMap.has(typeHash)) {
          const infoCellData = fastify.ckb.getInfoCellData(allInfoCellTxs, type);
          infoCellDataMap.set(typeHash, infoCellData);
        }
        const infoCellData = infoCellDataMap.get(typeHash);
        return infoCellData;
      };

      const allInfoCellTxs = await fastify.ckb.getAllInfoCellTxs();
      const xudtBalances: Record<string, XUDTBalance> = {};

      for await (const cell of cells) {
        const type = cell.cellOutput.type!;
        const typeHash = computeScriptHash(type);
        const infoCellData = await getInfoCellData(type);
        const amount = BI.from(leToU128(cell.data)).toHexString();
        if (infoCellData) {
          if (!xudtBalances[typeHash]) {
            xudtBalances[typeHash] = {
              ...infoCellData,
              typeHash,
              total_amount: amount,
              avaliable_amount: amount,
              pending_amount: '0x0',
            };
          } else {
            xudtBalances[typeHash].total_amount = BI.from(xudtBalances[typeHash].total_amount)
              .add(BI.from(amount))
              .toHexString();
            xudtBalances[typeHash].avaliable_amount = BI.from(xudtBalances[typeHash].avaliable_amount)
              .add(BI.from(amount))
              .toHexString();
          }
        }
      }

      const unconfirmedUtxos = utxos.filter((utxo) => !utxo.status.confirmed);
      const unconfirmedTxids = Array.from(new Set(...unconfirmedUtxos.map((utxo) => utxo.txid)));

      const pendingRgbppCkbTxOuputCells = await Promise.all(
        unconfirmedTxids.map(async (txid) => {
          const job = await fastify.transactionProcessor.getTransactionRequest(txid);
          if (!job) {
            return [];
          }
          const { ckbVirtualResult } = job.data;
          const outputs = ckbVirtualResult.ckbRawTx.outputs;
          return outputs.map((output, index) => {
            const cell: Cell = {
              outPoint: {
                txHash: txid,
                index: BI.from(index).toHexString(),
              },
              cellOutput: output,
              data: ckbVirtualResult.ckbRawTx.outputsData[index],
            };
            return cell;
          });
        }),
      );
      const pendingRgbppCells = typeScript
        ? await filterCellsByTypeScript(pendingRgbppCkbTxOuputCells.flat(), typeScript)
        : pendingRgbppCkbTxOuputCells.flat();

      for await (const cell of pendingRgbppCells) {
        const type = cell.cellOutput.type!;
        const typeHash = computeScriptHash(type);
        const infoCellData = await getInfoCellData(type);
        const amount = BI.from(leToU128(cell.data)).toHexString();
        if (infoCellData) {
          if (!xudtBalances[typeHash]) {
            xudtBalances[typeHash] = {
              ...infoCellData,
              typeHash,
              total_amount: amount,
              avaliable_amount: '0x0',
              pending_amount: amount,
            };
          } else {
            xudtBalances[typeHash].total_amount = BI.from(xudtBalances[typeHash].total_amount)
              .add(BI.from(amount))
              .toHexString();
            xudtBalances[typeHash].pending_amount = BI.from(xudtBalances[typeHash].pending_amount)
              .add(BI.from(amount))
              .toHexString();
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
