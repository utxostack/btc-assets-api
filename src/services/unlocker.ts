import { Cradle } from '../container';
import { buildBtcTimeCellsSpentTx, Collector, IndexerCell, sendCkbTx } from '@rgbpp-sdk/ckb';
import { genRgbppLockScript } from '@rgbpp-sdk/ckb/lib/utils/rgbpp';
import { Cell, CellCollector } from '@ckb-lumos/lumos';

interface IUnlocker {}

export default class Unlocker implements IUnlocker {
  private cradle: Cradle;
  private collector: CellCollector;

  constructor(cradle: Cradle) {
    this.cradle = cradle;
    this.collector = this.cradle.ckbIndexer.collector({
      lock: this.lockScript,
    }) as CellCollector;
  }

  private get isMainnet() {
    return this.cradle.env.NETWORK === 'mainnet';
  }

  private get lockScript() {
    return genRgbppLockScript('0x', this.isMainnet);
  }

  private async getNextBatchLockCell() {
    const collect = this.collector.collect();
    const cells: Cell[] = [];
    for await (const cell of collect) {
      // TODO: check cell lock args and skip if btc tx not confirmed 6 blocks yet
      cells.push(cell);
      if (cells.length >= this.cradle.env.UNLOCKER_CELL_BATCH_SIZE) {
        break;
      }
    }
    return cells;
  }

  public async unlockCells() {
    const cells = await this.getNextBatchLockCell();
    if (cells.length === 0) {
      return;
    }

    const signedTx = await buildBtcTimeCellsSpentTx({
      btcTimeCells: cells as unknown as IndexerCell[],
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
