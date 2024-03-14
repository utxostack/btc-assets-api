import { Cradle } from '../container';
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-expect-error
import { getRgbppLockScript, buildBtcTimeCellsSpentTx } from '@rgbpp-sdk/ckb';
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
    return getRgbppLockScript(this.isMainnet);
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

    const tx = buildBtcTimeCellsSpentTx({
      btcTimeCells: cells,
      isMainnet: this.isMainnet,
    });
    const txHash = this.cradle.ckbRpc.sendTransaction(tx, 'passthrough');
    return txHash;
  }
}
