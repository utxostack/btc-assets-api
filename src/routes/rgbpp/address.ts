import { FastifyPluginCallback, FastifyRequest } from 'fastify';
import { Server } from 'http';
import validateBitcoinAddress from '../../utils/validators';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import { CKBTransaction, Cell, IsomorphicTransaction, Script, XUDTBalance } from './types';
import { blockchain } from '@ckb-lumos/base';
import z from 'zod';
import { Env } from '../../env';
import { buildPreLockArgs, getXudtTypeScript, isScriptEqual, isTypeAssetSupported } from '@rgbpp-sdk/ckb';
import { groupBy } from 'lodash';
import { BI } from '@ckb-lumos/lumos';
import { UTXO } from '../../services/bitcoin/schema';
import { Transaction as BTCTransaction } from '../bitcoin/types';
import { tryGetCommitmentFromBtcTx } from '../../utils/commitment';
import { TransactionWithStatus } from '../../services/ckb';

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
        if (type_script.startsWith('0x')) {
          typeScript = blockchain.Script.unpack(type_script);
        } else {
          typeScript = JSON.parse(decodeURIComponent(type_script));
        }
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
      await fastify.rgbppCollector.enqueueCollectJob(btc_address);
    }
    const cells = rgbppUtxoCellsPairs.map((pair) => pair.cells).flat();
    return cells;
  }

  /**
   * Filter cells by type script
   */
  function filterCellsByTypeScript(cells: Cell[], typeScript: Script) {
    return cells.filter((cell) => {
      if (!cell.cellOutput.type) {
        return false;
      }
      // if typeScript.args is empty, only compare codeHash and hashType
      if (!typeScript.args || typeScript.args === '0x') {
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
      if (!isScriptEqual({ ...typeScript, args: '' }, scripts.XUDT)) {
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

      const pendingUtxos = utxos.filter(
        (utxo) =>
          !utxo.status.confirmed ||
          // include utxo that confirmed in 20 minutes to avoid missing pending xudt
          (utxo.status.block_time && Date.now() / 1000 - utxo.status.block_time < 20 * 60),
      );
      const pendingUtxosGroup = groupBy(pendingUtxos, (utxo) => utxo.txid);
      const pendingTxids = Object.keys(pendingUtxosGroup);

      const pendingOutputCellsGroup = await Promise.all(
        pendingTxids.map(async (txid) => {
          const cells = await fastify.transactionProcessor.getPendingOuputCellsByTxid(txid);
          const lockArgsSet = new Set(pendingUtxosGroup[txid].map((utxo) => buildPreLockArgs(utxo.vout)));
          return cells.filter((cell) => lockArgsSet.has(cell.cellOutput.lock.args));
        }),
      );
      let pendingOutputCells = pendingOutputCellsGroup.flat();
      if (typeScript) {
        pendingOutputCells = await filterCellsByTypeScript(pendingOutputCells, typeScript);
      }

      const pendingXudtBalances = await fastify.rgbppCollector.getRgbppBalanceByCells(pendingOutputCells);
      Object.values(pendingXudtBalances).forEach(({ amount, type_hash, ...xudtInfo }) => {
        if (!xudtBalances[type_hash]) {
          xudtBalances[type_hash] = {
            ...xudtInfo,
            type_hash,
            total_amount: '0x0',
            available_amount: '0x0',
            pending_amount: '0x0',
          };
        }

        xudtBalances[type_hash].pending_amount = BI.from(xudtBalances[type_hash].pending_amount)
          .add(BI.from(amount))
          .toHexString();
        xudtBalances[type_hash].total_amount = BI.from(xudtBalances[type_hash].total_amount)
          .add(BI.from(amount))
          .toHexString();
      });

      return {
        address: btc_address,
        xudt: Object.values(xudtBalances),
      };
    },
  );

  async function getIsomorphicTx(btcTx: BTCTransaction) {
    const isomorphicTx: IsomorphicTransaction = {
      ckbRawTx: undefined,
      ckbTx: undefined,
      status: { confirmed: false },
    };
    const setCkbTxAndStatus = (tx: TransactionWithStatus) => {
      isomorphicTx.ckbTx = CKBTransaction.parse(tx.transaction);
      isomorphicTx.status.confirmed = tx.txStatus.status === 'committed';
    };

    const job = await fastify.transactionProcessor.getTransactionRequest(btcTx.txid);
    if (job) {
      const { ckbRawTx } = job.data.ckbVirtualResult;
      isomorphicTx.ckbRawTx = ckbRawTx;
      // if the job is completed, get the ckb tx hash and fetch the ckb tx
      const state = await job.getState();
      if (state === 'completed') {
        const ckbTx = await fastify.ckb.rpc.getTransaction(job.returnvalue);
        // remove ckbRawTx to reduce response size
        isomorphicTx.ckbRawTx = undefined;
        setCkbTxAndStatus(ckbTx);
      }
      return isomorphicTx;
    }
    const rgbppLockTx = await fastify.rgbppCollector.queryRgbppLockTxByBtcTx(btcTx);
    if (rgbppLockTx) {
      const ckbTx = await fastify.ckb.rpc.getTransaction(rgbppLockTx.txHash);
      setCkbTxAndStatus(ckbTx);
    } else {
      // XXX: this is a performance bottleneck, need to optimize
      const btcTimeLockTx = await fastify.rgbppCollector.queryBtcTimeLockTxByBtcTxId(btcTx.txid);
      if (btcTimeLockTx) {
        setCkbTxAndStatus(btcTimeLockTx as TransactionWithStatus);
      }
    }
    return isomorphicTx;
  }

  fastify.get(
    '/:btc_address/activity',
    {
      schema: {
        description: 'Get RGB++ activity by btc address',
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
          rgbpp_only: z
            .enum(['true', 'false'])
            .default('false')
            .describe('Whether to get RGB++ only activity, default is false'),
          after_btc_txid: z.string().optional().describe('Get activity after this btc txid'),
        }),
        response: {
          200: z.object({
            address: z.string(),
            txs: z.array(
              z
                .object({
                  btcTx: BTCTransaction,
                })
                .and(
                  z.union([
                    z.object({
                      isRgbpp: z.literal(true),
                      isomorphicTx: IsomorphicTransaction,
                    }),
                    z.object({ isRgbpp: z.literal(false) }),
                  ]),
                ),
            ),
            cursor: z.string().optional(),
          }),
        },
      },
    },
    async (request) => {
      const { btc_address } = request.params;
      const { rgbpp_only, after_btc_txid } = request.query;
      const typeScript = getTypeScript(request);

      const btcTxs = await fastify.bitcoin.getAddressTxs({
        address: btc_address,
        after_txid: after_btc_txid,
      });
      const withCommitmentTxs = btcTxs.filter((btcTx) => tryGetCommitmentFromBtcTx(btcTx));

      let txs = await Promise.all(
        withCommitmentTxs.map(async (btcTx) => {
          const isomorphicTx = await getIsomorphicTx(btcTx);
          const isRgbpp = isomorphicTx.ckbRawTx || isomorphicTx.ckbTx;
          if (!isRgbpp) {
            return {
              btcTx,
              isRgbpp: false,
            } as const;
          }

          const inputOutpoints = isomorphicTx.ckbRawTx?.inputs || isomorphicTx.ckbTx?.inputs || [];
          const inputs = await fastify.ckb.getInputCellsByOutPoint(
            inputOutpoints.map((input) => input.previousOutput) as CKBComponents.OutPoint[],
          );
          const outputs = isomorphicTx.ckbRawTx?.outputs || isomorphicTx.ckbTx?.outputs || [];

          return {
            btcTx,
            isRgbpp: true,
            isomorphicTx: {
              ...isomorphicTx,
              inputs,
              outputs,
            },
          } as const;
        }),
      );

      if (rgbpp_only === 'true') {
        txs = txs.filter((tx) => tx.isRgbpp);
      }

      if (typeScript) {
        txs = txs.filter((tx) => {
          if (!tx.isRgbpp) {
            return false;
          }
          const cells = [...tx.isomorphicTx.inputs, ...tx.isomorphicTx.outputs];
          const filteredCells = cells.filter((cell) => {
            if (!cell.type) return false;
            if (!typeScript.args) {
              const script = { ...cell.type, args: '' };
              return isScriptEqual(script, typeScript);
            }
            return isScriptEqual(cell.type, typeScript);
          });
          return filteredCells.length > 0;
        });
      }

      const cursor = btcTxs.length > 0 ? btcTxs[btcTxs.length - 1].txid : undefined;
      return {
        address: btc_address,
        txs,
        cursor,
      };
    },
  );

  done();
};

export default addressRoutes;
