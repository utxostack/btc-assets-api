import { CellCollector } from '@ckb-lumos/lumos';
import { Cradle } from '../container';
import {
  Collector,
  IndexerCell,
  sendCkbTx,
  BTCTimeLock,
  getBtcTimeLockScript,
  remove0x,
  signBtcTimeCellSpentTx,
  getBtcTimeLockDep,
  getXudtDep,
  getBtcTimeLockConfigDep,
  Hex,
  BTC_JUMP_CONFIRMATION_BLOCKS,
  append0x,
  buildBtcTimeUnlockWitness,
} from '@rgbpp-sdk/ckb';
import {
  btcTxIdFromBtcTimeLockArgs,
  buildSpvClientCellDep,
  compareInputs,
  lockScriptFromBtcTimeLockArgs,
  transformSpvProof,
} from '@rgbpp-sdk/ckb/lib/utils/rgbpp';
import { serializeOutPoint, serializeWitnessArgs } from '@nervosnetwork/ckb-sdk-utils';

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
    this.collector = this.cradle.ckbIndexer.collector({
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
      const btcTxid = remove0x(btcTxIdFromBtcTimeLockArgs(cell.cellOutput.lock.args));
      const { after } = BTCTimeLock.unpack(cell.cellOutput.lock.args);
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
    this.cradle.logger.info(`[Unlocker] Unlock ${cells.length} BTC time lock cells`);

    const collector = new Collector({
      ckbNodeUrl: this.cradle.env.CKB_RPC_URL,
      ckbIndexerUrl: this.cradle.env.CKB_RPC_URL,
    });

    const ckbRawTx = await this.buildBtcTimeCellsSpentTx(cells);
    const signedTx = await signBtcTimeCellSpentTx({
      secp256k1PrivateKey: this.cradle.paymaster.privateKey,
      masterCkbAddress: this.cradle.paymaster.address,
      collector,
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

  /**
   * Given some btc-time-lock cells, build a CKB transaction to unlock them to the target lock_script
   * The btc-time-lock args data structure is: lock_script | after | new_bitcoin_tx_id
   */
  private async buildBtcTimeCellsSpentTx(btcTimeCells: IndexerCell[]): Promise<CKBComponents.RawTransaction> {
    const sortedBtcTimeCells = btcTimeCells.sort(compareInputs);
    const inputs: CKBComponents.CellInput[] = sortedBtcTimeCells.map((cell) => ({
      previousOutput: cell.outPoint,
      since: '0x0',
    }));

    const outputs: CKBComponents.CellOutput[] = sortedBtcTimeCells.map((cell) => ({
      lock: lockScriptFromBtcTimeLockArgs(cell.output.lock.args),
      type: cell.output.type,
      capacity: cell.output.capacity,
    }));

    const outputsData = sortedBtcTimeCells.map((cell) => cell.outputData);

    const cellDeps: CKBComponents.CellDep[] = [
      getBtcTimeLockDep(this.isMainnet),
      getXudtDep(this.isMainnet),
      getBtcTimeLockConfigDep(this.isMainnet),
    ];

    const witnesses: Hex[] = [];

    const lockArgsSet: Set<string> = new Set();
    const cellDepsSet: Set<string> = new Set();
    for await (const btcTimeCell of sortedBtcTimeCells) {
      if (lockArgsSet.has(btcTimeCell.output.lock.args)) {
        witnesses.push('0x');
        continue;
      }
      lockArgsSet.add(btcTimeCell.output.lock.args);
      const result = await this.cradle.bitcoinSPV.getBtcTxProof(
        btcTxIdFromBtcTimeLockArgs(btcTimeCell.output.lock.args),
        BTC_JUMP_CONFIRMATION_BLOCKS,
      );
      const { spvClient, proof } = transformSpvProof(result);

      if (!cellDepsSet.has(serializeOutPoint(spvClient))) {
        cellDeps.push(buildSpvClientCellDep(spvClient));
        cellDepsSet.add(serializeOutPoint(spvClient));
      }

      const btcTimeWitness = append0x(
        serializeWitnessArgs({ lock: buildBtcTimeUnlockWitness(proof), inputType: '', outputType: '' }),
      );
      witnesses.push(btcTimeWitness);
    }

    const ckbTx: CKBComponents.RawTransaction = {
      version: '0x0',
      cellDeps,
      headerDeps: [],
      inputs,
      outputs,
      outputsData,
      witnesses,
    };

    return ckbTx;
  }
}
