import { BI, CellCollector } from '@ckb-lumos/lumos';
import {
  BTCTimeLock,
  BTC_JUMP_CONFIRMATION_BLOCKS,
  Collector,
  IndexerCell,
  buildBtcTimeCellsSpentTx,
  getBtcTimeLockScript,
  isTypeAssetSupported,
  remove0x,
  sendCkbTx,
  signBtcTimeCellSpentTx,
} from '@rgbpp-sdk/ckb';
import { btcTxIdFromBtcTimeLockArgs } from '@rgbpp-sdk/ckb/lib/utils/rgbpp';
import { BtcAssetsApi } from '@rgbpp-sdk/service';
import { Cradle } from '../container';

interface IUnlocker {
  getNextBatchLockCell(): Promise<IndexerCell[]>;
  unlockCells(): Promise<string | undefined>;
}

/**
 * BTC Time lock cell unlocker
 * responsible for unlocking the BTC time lock cells and sending the CKB transactions.
 */
export default class Unlocker implements IUnlocker {
  private cradle: Cradle;
  private collector: CellCollector;

  constructor(cradle: Cradle) {
    this.cradle = cradle;
    this.collector = this.cradle.ckb.indexer.collector({
      lock: {
        ...this.lockScript,
        args: '0x',
      },
    }) as CellCollector;
  }

  private get isMainnet() {
    return this.cradle.env.NETWORK === 'mainnet';
  }

  private get lockScript() {
    return getBtcTimeLockScript(this.isMainnet);
  }

  /**
   * Get next batch of BTC time lock cells
   */
  public async getNextBatchLockCell() {
    const collect = this.collector.collect();
    const cells: IndexerCell[] = [];

    const { blocks } = await this.cradle.bitcoind.getBlockchainInfo();
    for await (const cell of collect) {
      // allow supported asset types only
      if (!cell.cellOutput.type || !isTypeAssetSupported(cell.cellOutput.type, this.isMainnet)) {
        continue;
      }

      const btcTxid = remove0x(btcTxIdFromBtcTimeLockArgs(cell.cellOutput.lock.args));
      const { after } = BTCTimeLock.unpack(cell.cellOutput.lock.args);
      const btcTx = await this.cradle.electrs.getTransaction(btcTxid);
      const blockHeight = btcTx.status.block_height;

      // skip if btc tx not confirmed $after blocks yet
      if (!blockHeight || blocks - blockHeight < after) {
        continue;
      }

      if (after < BTC_JUMP_CONFIRMATION_BLOCKS) {
        // Discussion: Is it better to delay these types of unlock jobs?
        const info = {
          after,
          output: cell.cellOutput,
        };
        this.cradle.logger.warn(
          `[Unlocker] Unlocking a BTC_TIME_LOCK cell with a small confirmations: ${JSON.stringify(info)}`,
        );
      }

      cells.push({
        blockNumber: cell.blockNumber!,
        outPoint: cell.outPoint!,
        output: cell.cellOutput,
        outputData: cell.data,
        txIndex: cell.txIndex!,
      });
      if (cells.length >= this.cradle.env.UNLOCKER_CELL_BATCH_SIZE) {
        break;
      }
    }
    return cells;
  }

  /**
   * Unlock the BTC time lock cells and send the CKB transaction
   */
  public async unlockCells() {
    const cells = await this.getNextBatchLockCell();
    if (cells.length === 0) {
      return;
    }
    this.cradle.logger.info(`[Unlocker] Unlock ${cells.length} BTC time lock cells`);

    const collector = new Collector({
      ckbNodeUrl: this.cradle.env.CKB_RPC_URL,
      ckbIndexerUrl: this.cradle.env.CKB_RPC_URL,
    });

    const btcAssetsApi = {
      getRgbppSpvProof: this.cradle.bitcoinSPV.getTxProof.bind(this.cradle.bitcoinSPV),
    } as unknown as BtcAssetsApi;
    const ckbRawTx = await buildBtcTimeCellsSpentTx({
      btcTimeCells: cells,
      btcAssetsApi,
      isMainnet: this.isMainnet,
    });

    const outputCapacityRange = [
      BI.from(1).toHexString(),
      BI.from(this.cradle.env.PAYMASTER_CELL_CAPACITY).toHexString(),
    ];
    const signedTx = await signBtcTimeCellSpentTx({
      secp256k1PrivateKey: this.cradle.paymaster.ckbPrivateKey,
      masterCkbAddress: this.cradle.paymaster.ckbAddress,
      collector,
      outputCapacityRange,
      ckbRawTx,
      isMainnet: this.isMainnet,
    });
    this.cradle.logger.debug(`[Unlocker] Transaction signed: ${JSON.stringify(signedTx)}`);

    const txHash = await sendCkbTx({
      collector,
      signedTx,
    });
    this.cradle.logger.info(`[Unlocker] Transaction sent: ${txHash}`);
    return txHash;
  }
}
