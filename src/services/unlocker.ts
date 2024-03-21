import { Cradle } from '../container';
import {
  BtcTimeCellPair,
  buildBtcTimeCellsSpentTx,
  Collector,
  IndexerCell,
  sendCkbTx,
  SPVService,
  BTCTimeLock,
} from '@rgbpp-sdk/ckb';
import { genRgbppLockScript } from '@rgbpp-sdk/ckb/lib/utils/rgbpp';
import { CellCollector } from '@ckb-lumos/lumos';

interface IUnlocker {}

/**
 * BTC Time lock cell unlocker
 * responsible for unlocking the BTC time lock cells and sending the CKB transactions.
 */
export default class Unlocker implements IUnlocker {
  private cradle: Cradle;
  private collector: CellCollector;
  private spvService: SPVService;

  constructor(cradle: Cradle) {
    this.cradle = cradle;
    this.collector = this.cradle.ckbIndexer.collector({
      lock: this.lockScript,
    }) as CellCollector;
    this.spvService = new SPVService(this.cradle.env.TRANSACTION_SPV_SERVICE_URL);
  }

  private get isMainnet() {
    return this.cradle.env.NETWORK === 'mainnet';
  }

  private get lockScript() {
    return genRgbppLockScript('0x', this.isMainnet);
  }

  /**
   * Get next batch of BTC time lock cells
   */
  private async getNextBatchLockCell() {
    const collect = this.collector.collect();
    const cells: IndexerCell[] = [];

    const { blocks } = await this.cradle.bitcoind.getBlockchainInfo();
    for await (const cell of collect) {
      const { after, btcTxid } = BTCTimeLock.unpack(cell.cellOutput.lock.args);
      const { blockheight } = await this.cradle.bitcoind.getTransaction(btcTxid);
      // skip if btc tx not confirmed $after blocks yet
      if (!blockheight || blocks - blockheight < after) {
        continue;
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

    const btcTimeCellPairs = await Promise.all(
      cells.map(async (cell) => {
        const { btcTxid } = BTCTimeLock.unpack(cell.output.lock.args);
        // get the btc tx index in the block to used for the spv proof
        const { blockindex } = await this.cradle.bitcoind.getTransaction(btcTxid);
        return {
          btcTimeCell: cell,
          btcTxIndexInBlock: blockindex,
        } as BtcTimeCellPair;
      }),
    );

    const signedTx = await buildBtcTimeCellsSpentTx({
      btcTimeCellPairs,
      spvService: this.spvService,
      isMainnet: this.isMainnet,
    });
    const txHash = await sendCkbTx({
      collector: new Collector({
        ckbNodeUrl: this.cradle.env.CKB_RPC_URL,
        ckbIndexerUrl: this.cradle.env.CKB_INDEXER_URL,
      }),
      signedTx,
    });
    return txHash;
  }
}
