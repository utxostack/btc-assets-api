import {
  Collector,
  generateUniqueTypeArgs,
  getSporeTypeScript,
  getUniqueTypeScript,
  getXudtTypeScript,
  sendCkbTx,
} from '@rgbpp-sdk/ckb';
import { Cradle } from '../container';
import { BI, Cell, Indexer, RPC, Script } from '@ckb-lumos/lumos';
import { z } from 'zod';
import * as Sentry from '@sentry/node';
import { scriptToHash, serializeScript } from '@nervosnetwork/ckb-sdk-utils';
import { computeScriptHash } from '@ckb-lumos/lumos/utils';
import {
  decodeUniqueCellData as decodeInfoCellData,
  getInscriptionTypeScript,
  isInscriptionTypeScript,
  isUniqueCellTypeScript,
} from '../utils/xudt';

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

  constructor(private cradle: Cradle) {
    this.rpc = new RPC(cradle.env.CKB_RPC_URL);
    this.indexer = new Indexer(cradle.env.CKB_RPC_URL);
  }

  /**
   * Get the ckb script configs
   */
  public getScripts() {
    const isMainnet = this.cradle.env.NETWORK === 'mainnet';
    const xudtTypeScript = getXudtTypeScript(isMainnet);
    const sporeTypeScript = getSporeTypeScript(isMainnet);
    const uniqueCellTypeScript = getUniqueTypeScript(isMainnet);
    const inscriptionTypeScript = getInscriptionTypeScript(isMainnet);
    return {
      XUDT: xudtTypeScript,
      SPORE: sporeTypeScript,
      UNIQUE: uniqueCellTypeScript,
      INSCRIPTION: inscriptionTypeScript,
    };
  }

  public async getAllInfoCellTxs() {
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
        'desc',
        '0xffff', // 0xffff basically means no limit
      );
    });
    type getTransactionsResult = ReturnType<typeof this.rpc.getTransactions<false>>;
    const infoCellTxs = (await batchRequest.exec()) as Awaited<getTransactionsResult>[];

    // get all transactions that have the xudt type cell and info cell
    batchRequest = this.rpc.createBatchRequest();
    infoCellTxs.forEach((txs) => {
      txs.objects
        .filter(({ ioType }) => ioType === 'output')
        .forEach((tx) => {
          batchRequest.add('getTransaction', tx.txHash);
        });
    });
    const txs = (await batchRequest.exec()) as CKBComponents.TransactionWithStatus[];
    return txs;
  }

  /**
   * Get the unique cell of the given xudt type
   * @param txs - the transactions that have the xudt type cell and unique cell
   * @param script - the xudt type script
   */
  public getInfoCellData(txs: CKBComponents.TransactionWithStatus[], script: Script) {
    const isMainnet = this.cradle.env.NETWORK === 'mainnet';
    for (const tx of txs) {
      const infoCellIndex = tx.transaction.outputs.findIndex(
        (cell) =>
          cell.type && (isUniqueCellTypeScript(cell.type, isMainnet) || isInscriptionTypeScript(cell.type, isMainnet)),
      );
      if (infoCellIndex !== -1) {
        const cellOutput = tx.transaction.outputs[infoCellIndex];
        const typeHash = computeScriptHash(script);

        const encodeData = tx.transaction.outputsData[infoCellIndex];
        if (!encodeData) {
          continue;
        }
        try {
          const data = decodeInfoCellData(encodeData);
          console.log('data', data);
        } catch (e) {
          // console.error('decodeInfoCellData error', e);
          // console.error('encodeData', encodeData);
        }

        console.log(
          scriptToHash({
            codeHash: '0xd23761b364210735c19c60561d213fb3beae2fd6172743719eff6920e020baac',
            args: '0x000171d1c2c21fbd12d9ead8d3a1ccf33dd912e49023',
            hashType: 'type',
          }),
        );

        // const infoCell: Cell = {
        //   cellOutput: {
        //     ...cellOutput,
        //     type: cellOutput.type || undefined,
        //   },
        //   data: encodeData,
        //   outPoint: {
        //     txHash: tx.transaction.hash,
        //     index: BI.from(infoCellIndex).toHexString(),
        //   },
        // };
        // return {
        //   ...data,
        //   typeHash,
        //   infoCell,
        // };
      }
    }
    return null;
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
