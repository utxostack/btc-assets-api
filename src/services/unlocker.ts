import { Cradle } from '../container';
import {
  BtcTimeCellPair,
  buildBtcTimeCellsSpentTx,
  Collector,
  IndexerCell,
  sendCkbTx,
  SPVService,
  BTCTimeLock,
  getBtcTimeLockScript,
  remove0x,
} from '@rgbpp-sdk/ckb';
import { btcTxIdFromBtcTimeLockArgs } from '@rgbpp-sdk/ckb/lib/utils/rgbpp';
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
      lock: {
        ...this.lockScript,
        args: '0x',
      },
    }) as CellCollector;
    this.spvService = new SPVService(this.cradle.env.BITCOIN_SPV_SERVICE_URL);
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
      const btcTxid = remove0x(btcTxIdFromBtcTimeLockArgs(cell.cellOutput.lock.args));
      const { after } = BTCTimeLock.unpack(cell.cellOutput.lock.args);
      console.log('btcTxid', btcTxid, after);
      const btcTx = await this.cradle.electrs.getTransaction(btcTxid);
      const blockHeight = btcTx.status.block_height;
      // skip if btc tx not confirmed $after blocks yet
      if (!blockHeight || blocks - blockHeight < after) {
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
    this.cradle.logger.info(`[Unlocker] Unlock ${cells.length} BTC time lock cells`)

    const btcTimeCellPairs = await Promise.all(
      cells.map(async (cell) => {
        const btcTxid = remove0x(btcTxIdFromBtcTimeLockArgs(cell.output.lock.args));
        const btcTx = await this.cradle.electrs.getTransaction(btcTxid);
        // get the btc tx index in the block to used for the spv proof
        const txids = await  this.cradle.electrs.getBlockTxIdsByHash(btcTx.status.block_hash!);
        const blockindex = txids.findIndex((txid) => txid === btcTxid);
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
    this.cradle.logger.debug(`[Unlocker] Transaction signed: ${JSON.stringify(signedTx)}`);

    const txHash = await sendCkbTx({
      collector: new Collector({
        ckbNodeUrl: this.cradle.env.CKB_RPC_URL,
        ckbIndexerUrl: this.cradle.env.CKB_INDEXER_URL,
      }),
      signedTx,
    });
    this.cradle.logger.info(`[Unlocker] Transaction sent: ${txHash}`);
    return txHash;
  }
}
