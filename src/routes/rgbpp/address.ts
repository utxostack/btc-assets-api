import { FastifyPluginCallback } from 'fastify';
import { Server } from 'http';
import validateBitcoinAddress from '../../utils/validators';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import { CKBTransaction, Cell, IsomorphicTransaction, Script, XUDTBalance } from './types';
import z from 'zod';
import { Env } from '../../env';
import { isScriptEqual, buildPreLockArgs, getXudtTypeScript, isTypeAssetSupported } from '@rgbpp-sdk/ckb';
import { groupBy, uniq } from 'lodash';
import { BI } from '@ckb-lumos/lumos';
import { UTXO } from '../../services/bitcoin/schema';
import { Transaction as BTCTransaction } from '../bitcoin/types';
import { TransactionWithStatus } from '../../services/ckb';
import { computeScriptHash } from '@ckb-lumos/lumos/utils';
import { filterCellsByTypeScript, getTypeScript } from '../../utils/typescript';
import { unpackRgbppLockArgs } from '@rgbpp-sdk/ckb';
import { remove0x } from '@rgbpp-sdk/btc';
import { isRgbppLock } from '../../utils/lockscript';
import { IS_MAINNET } from '../../constants';

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
   * Get UTXOs by btc address
   */
  async function getUtxos(btc_address: string, no_cache?: string) {
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
   * Filter RgbppLock cells by cells
   */
  function getRgbppLockCellsByCells(cells: Cell[]): Cell[] {
    return cells.filter((cell) => isRgbppLock(cell.cellOutput.lock));
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
          200: z.array(Cell.merge(z.object({ typeHash: z.string().optional() }))),
        },
      },
    },
    async (request) => {
      const { btc_address } = request.params;
      const { no_cache } = request.query;
      const utxos = await getUtxos(btc_address, no_cache);
      const cells = await getRgbppAssetsCells(btc_address, utxos, no_cache);
      const typeScript = getTypeScript(request.query.type_script);
      const assetCells = typeScript ? filterCellsByTypeScript(cells, typeScript) : cells;
      return assetCells.map((cell) => {
        const typeHash = cell.cellOutput.type ? computeScriptHash(cell.cellOutput.type) : undefined;
        return {
          ...cell,
          typeHash,
        };
      });
    },
  );

  fastify.get(
    '/:btc_address/balance',
    {
      schema: {
        description: `
          Get RGB++ balance by btc address, support xUDT only for now. 
          
          An address with more than 50 pending BTC transactions is uncommon. 
          However, if such a situation arises, it potentially affecting the returned total_amount.
        `,
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
            .default(getXudtTypeScript(IS_MAINNET)),
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

      const typeScript = getTypeScript(request.query.type_script);
      if (!typeScript || !isTypeAssetSupported(typeScript, IS_MAINNET)) {
        throw fastify.httpErrors.badRequest('Unsupported type asset');
      }
      const scripts = fastify.ckb.getScripts();
      if (!isScriptEqual({ ...typeScript, args: '' }, scripts.XUDT)) {
        throw fastify.httpErrors.badRequest('Unsupported type asset');
      }

      const xudtBalances: Record<string, XUDTBalance> = {};
      const utxos = await getUtxos(btc_address, no_cache);

      // Find confirmed RgbppLock XUDT assets
      const confirmedUtxos = utxos.filter((utxo) => utxo.status.confirmed);
      const confirmedCells = await getRgbppAssetsCells(btc_address, confirmedUtxos, no_cache);
      const confirmedTargetCells = filterCellsByTypeScript(confirmedCells, typeScript);
      const availableXudtBalances = await fastify.rgbppCollector.getRgbppBalanceByCells(confirmedTargetCells);
      Object.keys(availableXudtBalances).forEach((key) => {
        const { amount, ...xudtInfo } = availableXudtBalances[key];
        xudtBalances[key] = {
          ...xudtInfo,
          total_amount: amount,
          available_amount: amount,
          pending_amount: '0x0',
        };
      });

      // Find all unconfirmed RgbppLock XUDT outputs
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
          const cells = await fastify.transactionProcessor.getPendingOutputCellsByTxid(txid);
          const lockArgsSet = new Set(pendingUtxosGroup[txid].map((utxo) => buildPreLockArgs(utxo.vout)));
          return cells.filter((cell) => lockArgsSet.has(cell.cellOutput.lock.args));
        }),
      );
      const pendingOutputCells = filterCellsByTypeScript(pendingOutputCellsGroup.flat(), typeScript);
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
      });

      // Find spent RgbppLock XUDT assets in the inputs of the unconfirmed transactions
      // XXX: the bitcoin.getAddressTxs() API only returns up to 50 mempool transactions
      const latestTxs = await fastify.bitcoin.getAddressTxs({ address: btc_address });
      const unconfirmedTxids = latestTxs.filter((tx) => !tx.status.confirmed).map((tx) => tx.txid);
      const spendingInputCellsGroup = await Promise.all(
        unconfirmedTxids.map(async (txid) => {
          const inputCells = await fastify.transactionProcessor.getPendingInputCellsByTxid(txid);
          const inputRgbppCells = getRgbppLockCellsByCells(filterCellsByTypeScript(inputCells, typeScript));
          const inputCellLockArgs = inputRgbppCells.map((cell) => unpackRgbppLockArgs(cell.cellOutput.lock.args));

          const txids = uniq(inputCellLockArgs.map((args) => remove0x(args.btcTxId)));
          const txs = await Promise.all(txids.map((txid) => fastify.bitcoin.getTx({ txid })));
          const txsMap = txs.reduce(
            (sum, tx, index) => {
              const txid = txids[index];
              sum[txid] = tx ?? null;
              return sum;
            },
            {} as Record<string, BTCTransaction | null>,
          );

          return inputRgbppCells.filter((_, index) => {
            const lockArgs = inputCellLockArgs[index];
            const tx = txsMap[remove0x(lockArgs.btcTxId)];
            const utxo = tx?.vout[lockArgs.outIndex];
            return utxo?.scriptpubkey_address === btc_address;
          });
        }),
      );
      const spendingInputCells = spendingInputCellsGroup.flat();
      const spendingXudtBalances = await fastify.rgbppCollector.getRgbppBalanceByCells(spendingInputCells);
      Object.values(spendingXudtBalances).forEach(({ amount, type_hash, ...xudtInfo }) => {
        if (!xudtBalances[type_hash]) {
          xudtBalances[type_hash] = {
            ...xudtInfo,
            type_hash,
            total_amount: '0x0',
            available_amount: '0x0',
            pending_amount: '0x0',
          };
        }

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
      ckbVirtualTx: undefined,
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
      isomorphicTx.ckbVirtualTx = ckbRawTx;
      // if the job is completed, get the ckb tx hash and fetch the ckb tx
      const state = await job.getState();
      if (state === 'completed') {
        const ckbTx = await fastify.ckb.rpc.getTransaction(job.returnvalue);
        // remove ckbRawTx to reduce response size
        isomorphicTx.ckbVirtualTx = undefined;
        setCkbTxAndStatus(ckbTx);
      }
      return isomorphicTx;
    }
    const rgbppLockTx = await fastify.rgbppCollector.queryRgbppLockTxByBtcTx(btcTx);
    if (rgbppLockTx) {
      const ckbTx = await fastify.ckb.rpc.getTransaction(rgbppLockTx.txHash);
      setCkbTxAndStatus(ckbTx);
    } else {
      const btcTimeLockTx = await fastify.rgbppCollector.queryBtcTimeLockTxByBtcTx(btcTx);
      if (btcTimeLockTx) {
        setCkbTxAndStatus(btcTimeLockTx);
      }
    }
    return isomorphicTx;
  }

  fastify.get(
    '/:btc_address/activity',
    {
      schema: {
        description: 'Get RGB++ activity by btc address',
        tags: ['RGB++@Unstable'],
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
            .optional(),
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
      const typeScript = getTypeScript(request.query.type_script);

      const btcTxs = await fastify.bitcoin.getAddressTxs({
        address: btc_address,
        after_txid: after_btc_txid,
      });

      let txs = await Promise.all(
        btcTxs.map(async (btcTx) => {
          const isomorphicTx = await getIsomorphicTx(btcTx);
          const isRgbpp = isomorphicTx.ckbVirtualTx || isomorphicTx.ckbTx;
          if (!isRgbpp) {
            return {
              btcTx,
              isRgbpp: false,
            } as const;
          }

          const inputs = isomorphicTx.ckbVirtualTx?.inputs || isomorphicTx.ckbTx?.inputs || [];
          const inputCells = await fastify.ckb.getInputCellsByOutPoint(inputs.map((input) => input.previousOutput!));
          const inputCellOutputs = inputCells.map((cell) => cell.cellOutput);

          const outputs = isomorphicTx.ckbVirtualTx?.outputs || isomorphicTx.ckbTx?.outputs || [];

          return {
            btcTx,
            isRgbpp: true,
            isomorphicTx: {
              ...isomorphicTx,
              inputs: inputCellOutputs,
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
