import {
  Collector,
  getSporeTypeScript,
  getUniqueTypeScript,
  getXudtTypeScript,
  isScriptEqual,
  sendCkbTx,
} from '@rgbpp-sdk/ckb';
import { Cradle } from '../container';
import { BI, Indexer, RPC, Script } from '@ckb-lumos/lumos';
import { CKBRPC } from '@ckb-lumos/rpc';
import { UngroupedIndexerTransaction } from '@ckb-lumos/ckb-indexer/lib/type';
import { z } from 'zod';
import * as Sentry from '@sentry/node';
import {
  decodeInfoCellData,
  decodeUDTHashFromInscriptionData,
  getInscriptionInfoTypeScript,
  isInscriptionInfoTypeScript,
  isUniqueCellTypeScript,
} from '../utils/xudt';
import { computeScriptHash } from '@ckb-lumos/lumos/utils';
import DataCache from './base/data-cache';
import { scriptToHash } from '@nervosnetwork/ckb-sdk-utils';
import { Cell } from '../routes/rgbpp/types';
import { uniq } from 'lodash';
import { IS_MAINNET } from '../constants';

export type TransactionWithStatus = Awaited<ReturnType<CKBRPC['getTransaction']>>;

// https://github.com/nervosnetwork/ckb/blob/develop/rpc/src/error.rs#L33
export enum CKBRPCErrorCodes {
  /// (-1): CKB internal errors are considered to never happen or only happen when the system
  /// resources are exhausted.
  CKBInternalError = -1,
  /// (-2): The CKB method has been deprecated and disabled.
  ///
  /// Set `rpc.enable_deprecated_rpc` to `true` in the config file to enable all deprecated
  /// methods.
  Deprecated = -2,
  /// (-3): Error code -3 is no longer used.
  ///
  /// Before v0.35.0, CKB returns all RPC errors using the error code -3. CKB no longer uses
  /// -3 since v0.35.0.
  Invalid = -3,
  /// (-4): The RPC method is not enabled.
  ///
  /// CKB groups RPC methods into modules, and a method is enabled only when the module is
  /// explicitly enabled in the config file.
  RPCModuleIsDisabled = -4,
  /// (-5): DAO related errors.
  DaoError = -5,
  /// (-6): Integer operation overflow.
  IntegerOverflow = -6,
  /// (-7): The error is caused by a config file option.
  ///
  /// Users have to edit the config file to fix the error.
  ConfigError = -7,
  /// (-101): The CKB local node failed to broadcast a message to its peers.
  P2PFailedToBroadcast = -101,
  /// (-200): Internal database error.
  ///
  /// The CKB node persists data to the database. This is the error from the underlying database
  /// module.
  DatabaseError = -200,
  /// (-201): The chain index is inconsistent.
  ///
  /// An example of an inconsistent index is that the chain index says a block hash is in the chain
  /// but the block cannot be read from the database.
  ///
  /// This is a fatal error usually due to a serious bug. Please back up the data directory and
  /// re-sync the chain from scratch.
  ChainIndexIsInconsistent = -201,
  /// (-202): The underlying database is corrupt.
  ///
  /// This is a fatal error usually caused by the underlying database used by CKB. Please back up
  /// the data directory and re-sync the chain from scratch.
  DatabaseIsCorrupt = -202,
  /// (-301): Failed to resolve the referenced cells and headers used in the transaction, as inputs or
  /// dependencies.
  TransactionFailedToResolve = -301,
  /// (-302): Failed to verify the transaction.
  TransactionFailedToVerify = -302,
  /// (-1000): Some signatures in the submit alert are invalid.
  AlertFailedToVerifySignatures = -1000,
  /// (-1102): The transaction is rejected by the outputs validator specified by the RPC parameter.
  PoolRejectedTransactionByOutputsValidator = -1102,
  /// (-1103): Pool rejects some transactions which seem contain invalid VM instructions. See the issue
  /// link in the error message for details.
  PoolRejectedTransactionByIllTransactionChecker = -1103,
  /// (-1104): The transaction fee rate must be greater than or equal to the config option `tx_pool.min_fee_rate`
  ///
  /// The fee rate is calculated as:
  ///
  /// ```text
  /// fee / (1000 * tx_serialization_size_in_block_in_bytes)
  /// ```
  PoolRejectedTransactionByMinFeeRate = -1104,
  /// (-1105): The in-pool ancestors count must be less than or equal to the config option `tx_pool.max_ancestors_count`
  ///
  /// Pool rejects a large package of chained transactions to avoid certain kinds of DoS attacks.
  PoolRejectedTransactionByMaxAncestorsCountLimit = -1105,
  /// (-1106): The transaction is rejected because the pool has reached its limit.
  PoolIsFull = -1106,
  /// (-1107): The transaction is already in the pool.
  PoolRejectedDuplicatedTransaction = -1107,
  /// (-1108): The transaction is rejected because it does not make sense in the context.
  ///
  /// For example, a cellbase transaction is not allowed in `send_transaction` RPC.
  PoolRejectedMalformedTransaction = -1108,
  /// (-1109): The transaction is expired from tx-pool after `expiry_hours`.
  TransactionExpired = -1109,
  /// (-1110): The transaction exceeded maximum size limit.
  PoolRejectedTransactionBySizeLimit = -1110,
  /// (-1111): The transaction is rejected for RBF checking.
  PoolRejectedRBF = -1111,
  /// (-1112): The transaction is rejected for ref cell consuming.
  PoolRejectedInvalidated = -1112,
  /// (-1200): The indexer error.
  Indexer = -1200,
}

export class CKBRpcError extends Error {
  private messageSchema = z.object({
    code: z.number(),
    message: z.string(),
  });

  public code?: number;
  public message: string;

  constructor(message: string) {
    super(message);
    this.name = 'CKBRpcError';
    this.message = message;

    try {
      const error = JSON.parse(message);
      const parsed = this.messageSchema.safeParse(error);
      if (parsed.success) {
        this.code = parsed.data.code;
        this.message = parsed.data.message;
      }
    } catch (e) {
      Sentry.captureException(e);
    }
  }
}

export default class CKBClient {
  public rpc: RPC;
  public indexer: Indexer;
  private dataCache: DataCache<unknown>;

  constructor(private cradle: Cradle) {
    this.rpc = new RPC(cradle.env.CKB_RPC_URL);
    this.indexer = new Indexer(cradle.env.CKB_RPC_URL);
    this.dataCache = new DataCache(cradle.redis, {
      prefix: 'ckb-info-cell-txs',
      expire: 10 * 60 * 1000,
    });
  }

  /**
   * Get the ckb script configs
   */
  public getScripts() {
    const xudtTypeScript = getXudtTypeScript(IS_MAINNET);
    const sporeTypeScript = getSporeTypeScript(IS_MAINNET);
    const uniqueCellTypeScript = getUniqueTypeScript(IS_MAINNET);
    const inscriptionTypeScript = getInscriptionInfoTypeScript(IS_MAINNET);
    return {
      XUDT: xudtTypeScript,
      SPORE: sporeTypeScript,
      UNIQUE: uniqueCellTypeScript,
      INSCRIPTION: inscriptionTypeScript,
    };
  }

  /**
   * Get the unique cell data of the given xudt type script from the transaction
   * @param tx - the ckb transaction that contains the unique cell
   * @param index - the index of the unique cell in the transaction
   * @param xudtTypeScript - the xudt type script
   * reference:
   * - https://github.com/ckb-cell/unique-cell
   */
  public getUniqueCellData(tx: TransactionWithStatus, index: number, xudtTypeScript: Script) {
    // find the xudt cell index in the transaction
    // generally, the xudt cell and unique cell are in the same transaction
    const xudtCellIndex = tx.transaction.outputs.findIndex((cell) => {
      return cell.type && isScriptEqual(cell.type, xudtTypeScript);
    });
    if (xudtCellIndex === -1) {
      return null;
    }

    const encodeData = tx.transaction.outputsData[index];
    if (!encodeData) {
      return null;
    }
    const data = decodeInfoCellData(encodeData);
    return data;
  }

  /**
   * Get the inscription cell data of the given xudt type script from the transaction
   * @param tx - the ckb transaction that contains the inscription cell
   * @param index - the index of the inscription cell in the transaction
   * @param xudtTypeScript - the xudt type script
   * reference:
   * - https://omiga-core.notion.site/Omiga-Inscritption-885f9073c1a6499db08f5815b7de20d7
   * - https://github.com/duanyytop/ckb-omiga/blob/master/src/inscription/helper.ts#L96-L109
   */
  public getInscriptionInfoCellData(tx: TransactionWithStatus, index: number, xudtTypeScript: Script) {
    const encodeData = tx.transaction.outputsData[index];
    if (!encodeData) {
      return null;
    }
    const xudtTypeHash = scriptToHash(xudtTypeScript);
    if (decodeUDTHashFromInscriptionData(encodeData) !== xudtTypeHash) {
      return null;
    }
    const data = decodeInfoCellData(encodeData);
    return data;
  }

  /**
   * Get all transactions that have the xudt type cell and info cell
   */
  public async getAllInfoCellTxs() {
    const cachedTxs = await this.dataCache.get('all');
    if (cachedTxs) {
      return cachedTxs as TransactionWithStatus[];
    }

    const scripts = this.getScripts();
    let batchRequest = this.rpc.createBatchRequest();

    // info cell script could be unique cell or inscription cell
    [scripts.UNIQUE, scripts.INSCRIPTION].forEach((script) => {
      const searchScript = { ...script, args: '0x' };
      batchRequest.add(
        'getTransactions',
        {
          script: searchScript,
          scriptType: 'type',
        },
        // XXX: The returned result is not asc-ordered, maybe it is a bug in ckb-indexer
        'asc',
        // TODO: There may be a maximum request limit.
        '0xffff', // 0xffff basically means no limit
      );
    });
    type getTransactionsResult = ReturnType<typeof this.rpc.getTransactions<false>>;
    const infoCellTxs: Awaited<getTransactionsResult>[] = await batchRequest.exec();
    const allIndexerTxs = infoCellTxs.reduce(
      (acc, txs) => acc.concat(txs.objects.filter(({ ioType }: UngroupedIndexerTransaction) => ioType === 'output')),
      [] as UngroupedIndexerTransaction[],
    );

    // get all transactions that have the xudt type cell and info cell
    batchRequest = this.rpc.createBatchRequest();
    allIndexerTxs
      .sort((txA: UngroupedIndexerTransaction, txB: UngroupedIndexerTransaction) => {
        // make sure `infoCellTxs` are asc-ordered
        // related issue: https://github.com/nervosnetwork/ckb/issues/4549
        const aBlockNumber = BI.from(txA.blockNumber).toNumber();
        const bBlockNumber = BI.from(txB.blockNumber).toNumber();
        if (aBlockNumber < bBlockNumber) return -1;
        else if (aBlockNumber > bBlockNumber) return 1;
        else if (aBlockNumber === bBlockNumber) {
          const aTxIndex = BI.from(txA.txIndex).toNumber();
          const bTxIndex = BI.from(txB.txIndex).toNumber();
          if (aTxIndex < bTxIndex) return -1;
          else if (aTxIndex > bTxIndex) return 1;
        }
        // unreachable: aBlockNumber === bBlockNumber && aTxIndex === bTxIndex
        return 0;
      })
      .forEach((tx: UngroupedIndexerTransaction) => {
        batchRequest.add('getTransaction', tx.txHash);
      });
    const txs: TransactionWithStatus[] = await batchRequest.exec();
    await this.dataCache.set('all', txs);
    return txs;
  }

  /**
   * Get the unique cell of the given xudt type
   * @param script - the xudt type script
   */
  public async getInfoCellData(script: Script) {
    const typeHash = computeScriptHash(script);
    const cachedData = await this.dataCache.get(`type:${typeHash}`);
    if (cachedData) {
      return cachedData as ReturnType<typeof decodeInfoCellData>;
    }

    const txs = await this.getAllInfoCellTxs();
    for (const tx of txs) {
      // check if the unique cell is the info cell of the xudt type
      const uniqueCellIndex = tx.transaction.outputs.findIndex((cell) => {
        return cell.type && isUniqueCellTypeScript(cell.type, IS_MAINNET);
      });
      if (uniqueCellIndex !== -1) {
        const infoCellData = this.getUniqueCellData(tx, uniqueCellIndex, script);
        if (infoCellData) {
          await this.dataCache.set(`type:${typeHash}`, infoCellData);
          return infoCellData;
        }
      }
      // check if the inscription cell is the info cell of the xudt type
      const inscriptionCellIndex = tx.transaction.outputs.findIndex((cell) => {
        return cell.type && isInscriptionInfoTypeScript(cell.type, IS_MAINNET);
      });
      if (inscriptionCellIndex !== -1) {
        const infoCellData = this.getInscriptionInfoCellData(tx, inscriptionCellIndex, script);
        if (infoCellData) {
          // TODO: `type:${typeHash}` could be cached for a longer time
          await this.dataCache.set(`type:${typeHash}`, infoCellData);
          return infoCellData;
        }
      }
    }
    return null;
  }

  public async getInputCellsByOutPoint(outPoints: CKBComponents.OutPoint[]): Promise<Cell[]> {
    const txHashes = uniq(outPoints.map((outPoint) => outPoint.txHash));
    const batchRequest = this.rpc.createBatchRequest(txHashes.map((txHash) => ['getTransaction', txHash]));
    const txs: TransactionWithStatus[] = await batchRequest.exec();
    const txsMap = txs.reduce(
      (acc, tx: TransactionWithStatus) => {
        acc[tx.transaction.hash] = tx;
        return acc;
      },
      {} as Record<string, TransactionWithStatus>,
    );
    return outPoints.map((outPoint) => {
      const tx = txsMap[outPoint.txHash];
      const outPointIndex = BI.from(outPoint.index).toNumber();
      return Cell.parse({
        cellOutput: tx.transaction.outputs[outPointIndex],
        data: tx.transaction.outputsData[outPointIndex],
        blockHash: tx.txStatus.blockHash,
        outPoint,
      });
    });
  }

  /**
   * Wait for the ckb transaction to be confirmed
   * @param txHash - the ckb transaction hash
   */
  public waitForTranscationConfirmed(txHash: string) {
    // eslint-disable-next-line no-async-promise-executor
    return new Promise(async (resolve) => {
      try {
        const transaction = await this.rpc.getTransaction(txHash);
        const { status } = transaction.txStatus;
        if (status === 'committed') {
          resolve(txHash);
        } else {
          setTimeout(() => {
            resolve(this.waitForTranscationConfirmed(txHash));
          }, 1000);
        }
      } catch (e) {
        Sentry.withScope((scope) => {
          scope.setTag('ckb_txhash', txHash);
          scope.captureException(e);
        });
        setTimeout(() => {
          resolve(this.waitForTranscationConfirmed(txHash));
        }, 1000);
      }
    });
  }

  /**
   * Send a ckb transaction
   * @param signedTx - the signed ckb transaction
   */
  public async sendTransaction(signedTx: CKBComponents.RawTransaction): Promise<string> {
    try {
      const txHash = await sendCkbTx({
        collector: new Collector({
          ckbNodeUrl: this.cradle.env.CKB_RPC_URL,
          ckbIndexerUrl: this.cradle.env.CKB_RPC_URL,
        }),
        signedTx,
      });
      return txHash;
    } catch (err) {
      if (err instanceof Error) {
        const rpcError = new CKBRpcError(err.message);
        rpcError.stack = err.stack;
        throw rpcError;
      }
      throw err;
    }
  }
}
