import { Cell, helpers } from '@ckb-lumos/lumos';
import { Cradle } from '../container';
import { DelayedError, Queue, Worker } from 'bullmq';
import { AppendPaymasterCellAndSignTxParams, IndexerCell, appendPaymasterCellAndSignCkbTx } from '@rgbpp-sdk/ckb';
import { hd, config, BI } from '@ckb-lumos/lumos';
import * as Sentry from '@sentry/node';
import { Transaction } from '../routes/bitcoin/types';

interface IPaymaster {
  getNextCell(token: string): Promise<IndexerCell | null>;
  refillCellQueue(): Promise<number>;
  appendCellAndSignTx(
    txid: string,
    params: Pick<AppendPaymasterCellAndSignTxParams, 'ckbRawTx' | 'sumInputsCapacity'>,
  ): ReturnType<typeof appendPaymasterCellAndSignCkbTx>;
  markPaymasterCellAsSpent(txid: string, signedTx: CKBComponents.RawTransaction): Promise<void>;
}

export const PAYMASTER_CELL_QUEUE_NAME = 'rgbpp-ckb-paymaster-cell-queue';

class PaymasterCellNotEnoughError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PaymasterCellNotEnoughError';
  }
}

/**
 * Paymaster
 * responsible for managing the paymaster cells and signing the CKB transactions.
 */
export default class Paymaster implements IPaymaster {
  private cradle: Cradle;
  private queue: Queue<Cell>;
  private worker: Worker<Cell>;

  private cellCapacity: number;
  private presetCount: number;
  // the threshold to refill the queue, default is 0.3
  private refillThreshold: number;
  // avoid the refilling to be triggered multiple times
  private refilling = false;

  constructor(cradle: Cradle) {
    this.cradle = cradle;
    this.queue = new Queue(PAYMASTER_CELL_QUEUE_NAME, {
      connection: cradle.redis,
    });
    this.worker = new Worker(PAYMASTER_CELL_QUEUE_NAME, undefined, {
      connection: cradle.redis,
      lockDuration: 60_000,
      removeOnComplete: { count: 0 },
      removeOnFail: { count: 0 },
    });
    this.cellCapacity = this.cradle.env.PAYMASTER_CELL_CAPACITY;
    this.presetCount = this.cradle.env.PAYMASTER_CELL_PRESET_COUNT;
    this.refillThreshold = this.cradle.env.PAYMASTER_CELL_REFILL_THRESHOLD;
  }

  private get lockScript() {
    const args = hd.key.privateKeyToBlake160(this.ckbPrivateKey);
    const scripts =
      this.cradle.env.NETWORK === 'mainnet' ? config.predefined.LINA.SCRIPTS : config.predefined.AGGRON4.SCRIPTS;
    const template = scripts['SECP256K1_BLAKE160']!;
    const lockScript = {
      codeHash: template.CODE_HASH,
      hashType: template.HASH_TYPE,
      args: args,
    };
    return lockScript;
  }

  /**
   * Get the paymaster cell job by the raw transaction
   * @param rawTx - the raw transaction may contains an input using one paymaster cell
   */
  private getPaymasterCellJobByRawTx(rawTx: CKBComponents.RawTransaction) {
    for (const input of rawTx.inputs) {
      const outPoint = input.previousOutput;
      if (!outPoint) {
        continue;
      }
      const id = `${outPoint.txHash}:${outPoint.index}`;
      const job = this.queue.getJob(id);
      if (job) {
        return job;
      }
    }
    return null;
  }

  private async captureExceptionToSentryScope(err: Error, attrs?: Record<string, unknown>) {
    const remaining = await this.queue.getWaitingCount();
    Sentry.withScope((scope) => {
      scope.setContext('paymaster', {
        address: this.ckbAddress,
        remaining: remaining,
        preset: this.presetCount,
        threshold: this.refillThreshold,
        ...attrs,
      });
      scope.captureException(err);
    });
    return;
  }

  /*
   * Get the private key of the paymaster ckb address, used to sign the transaction.
   */
  public get ckbPrivateKey() {
    return this.cradle.env.PAYMASTER_PRIVATE_KEY;
  }

  /**
   * is the paymaster receives UTXO check enabled
   */
  public get enablePaymasterReceivesUTXOCheck() {
    return this.cradle.env.PAYMASTER_RECEIVE_UTXO_CHECK && !!this.cradle.env.PAYMASTER_RECEIVE_BTC_ADDRESS;
  }

  /**
   * The paymaster CKB address to pay the time cells spent tx fee
   */
  public get ckbAddress() {
    const isMainnet = this.cradle.env.NETWORK === 'mainnet';
    const lumosConfig = isMainnet ? config.predefined.LINA : config.predefined.AGGRON4;
    const args = hd.key.privateKeyToBlake160(this.ckbPrivateKey);
    const template = lumosConfig.SCRIPTS['SECP256K1_BLAKE160'];
    const lockScript = {
      codeHash: template.CODE_HASH,
      hashType: template.HASH_TYPE,
      args: args,
    };
    return helpers.encodeToAddress(lockScript, {
      config: lumosConfig,
    });
  }

  /**
   * The paymaster BTC address to receive the BTC UTXO
   */
  public get btcAddress() {
    return this.cradle.env.PAYMASTER_RECEIVE_BTC_ADDRESS;
  }

  /**
   * The paymaster container fee in sats
   * Paymaster received utxo should be greater than or equal to the container fee
   */
  public get containerFee() {
    // XXX: fixed fee for now, may change in the future
    return this.cradle.env.PAYMASTER_BTC_CONTAINER_FEE_SATS;
  }

  /**
   * Get the paymaster cell count in the queue
   */
  public getPaymasterCellCount() {
    return this.queue.getWaitingCount();
  }

  /**
   * Check if the paymaster has received the BTC UTXO
   * @param btcTx - the BTC transaction
   */
  public hasPaymasterReceivedBtcUTXO(btcTx: Transaction) {
    const hasVaildOutput = btcTx.vout.some((output) => {
      return output.scriptpubkey_address === this.btcAddress && output.value >= this.containerFee;
    });
    return hasVaildOutput;
  }

  /**
   * Get the next paymaster cell from the queue
   * will refill the queue if the count is less than the threshold
   * @param token - the token to get the next job, using btc txid by default
   */
  public async getNextCell(token: string) {
    // avoid the refilling to be triggered multiple times
    if (!this.refilling) {
      const count = await this.queue.getWaitingCount();
      // refill if it's less than REFILL_THRESHOLD of the preset count
      if (count < this.presetCount * this.refillThreshold) {
        this.refilling = true;
        const filled = await this.refillCellQueue();
        if (filled + count < this.presetCount) {
          // XXX: consider to send an alert email or other notifications
          this.cradle.logger.warn('Filled paymaster cells less than the preset count');
          const error = new PaymasterCellNotEnoughError('Filled paymaster cells less than the preset count');
          this.captureExceptionToSentryScope(error, {
            filled,
          });
        }
        this.refilling = false;
      }
    }

    let cell: IndexerCell | null = null;
    while (!cell) {
      const job = await this.worker.getNextJob(token);
      if (!job) {
        break;
      }

      const data = job.data;
      const liveCell = await this.cradle.ckb.rpc.getLiveCell(data.outPoint!, false);
      if (!liveCell || liveCell.status !== 'live') {
        job.moveToFailed(new Error('The paymaster cell is not live'), token);
        continue;
      }

      cell = {
        output: data.cellOutput,
        outPoint: data.outPoint!,
        outputData: data.data,
        blockNumber: data.blockNumber!,
        txIndex: data.txIndex!,
      };
    }

    return cell;
  }

  /**
   * Refill the paymaster cell queue
   * get cells from the indexer and add them to the queue
   * make sure the queue has enough cells to use for the next transactions
   */
  public async refillCellQueue() {
    const queueSize = await this.queue.getWaitingCount();
    let filled = 0;
    if (queueSize >= this.presetCount) {
      return filled;
    }

    const collector = this.cradle.ckb.indexer.collector({
      lock: this.lockScript,
      type: 'empty',
      outputCapacityRange: [BI.from(this.cellCapacity).toHexString(), BI.from(this.cellCapacity + 1).toHexString()],
    });
    const cells = collector.collect();

    for await (const cell of cells) {
      const outPoint = cell.outPoint!;
      const jobId = `${outPoint.txHash}:${outPoint.index}`;

      // check if the cell is already in the queue
      const job = await this.queue.getJob(jobId);
      if (job) {
        this.cradle.logger.info(`[Paymaster] Paymaster cell already in the queue: ${jobId}`);
        // cause the issue that the job is not moved to delayed when appendCellAndSignTx throw error
        // try to remove the inactive job and add the cell back to the queue
        // (inactive job means the job is processed on 1 minute ago but not completed)
        const active = await job.isActive();
        if (active && job.processedOn && job.processedOn < Date.now() - 60_000) {
          this.cradle.logger.warn(`[Paymaster] Remove the inactive paymaster cell: ${jobId}`);
          await job.remove();
        } else {
          continue;
        }
      }
      // add the cell to the queue
      await this.queue.add(PAYMASTER_CELL_QUEUE_NAME, cell, { jobId });
      this.cradle.logger.info(`[Paymaster] Refill paymaster cell: ${jobId}`);
      filled += 1;
      // break if the filled cells are enough
      if (queueSize + filled >= this.presetCount) {
        break;
      }
    }
    return filled;
  }

  /**
   * Append the paymaster cell to the CKB transaction and sign the transactions
   * @param token - the token to get the next job, using btc txid by default
   * @param params - the ckb transaction parameters
   */
  public async appendCellAndSignTx(
    token: string,
    params: Pick<AppendPaymasterCellAndSignTxParams, 'ckbRawTx' | 'sumInputsCapacity'>,
  ) {
    try {
      const { ckbRawTx, sumInputsCapacity } = params;
      const paymasterCell = await this.getNextCell(token);
      this.cradle.logger.info(`[Paymaster] Get paymaster cell: ${JSON.stringify(paymasterCell)}`);

      if (!paymasterCell) {
        const error = new PaymasterCellNotEnoughError('No paymaster cell available');
        this.captureExceptionToSentryScope(error);
        throw error;
      }

      const signedTx = await appendPaymasterCellAndSignCkbTx({
        ckbRawTx,
        sumInputsCapacity,
        paymasterCell,
        secp256k1PrivateKey: this.ckbPrivateKey,
        isMainnet: this.cradle.env.NETWORK === 'mainnet',
      });
      this.cradle.logger.info(`[Paymaster] Signed transaction: ${JSON.stringify(signedTx)}`);
      return signedTx;
    } catch (err) {
      if (err instanceof PaymasterCellNotEnoughError) {
        // delay the job to retry later if the paymaster cell is not enough
        throw new DelayedError();
      }
      throw err;
    }
  }

  /**
   * Mark the paymaster cell as spent after the transaction is confirmed to avoid double spending
   * @param token - the job token moved from the queue to the completed
   * @param signedTx - the signed transaction to get the paymaster cell input to mark as spent
   */
  public async markPaymasterCellAsSpent(token: string, signedTx: CKBComponents.RawTransaction) {
    try {
      const job = await this.getPaymasterCellJobByRawTx(signedTx);
      if (job) {
        this.cradle.logger.info(`[Paymaster] Mark paymaster cell as spent: ${token}`);
        await job.moveToCompleted(null, token, false);
      }
    } catch (err) {
      this.cradle.logger.error(`[Paymaster] Mark paymaster cell as spent failed: ${token}`);
      this.captureExceptionToSentryScope(err as Error);
      // XXX: Don't throw the error to avoid the transaction marked as failed
    }
  }

  /**
   * Mark the paymaster cell as unspent after the transaction is failed
   * @param token - the job token moved from the queue to the delayed
   * @param signedTx - the signed transaction to get the paymaster cell input to mark as unspent
   */
  public async markPaymasterCellAsUnspent(token: string, signedTx: CKBComponents.RawTransaction) {
    try {
      const job = await this.getPaymasterCellJobByRawTx(signedTx);
      if (job) {
        this.cradle.logger.info(`[Paymaster] Mark paymaster cell as unspent: ${token}`);
        await job.moveToDelayed(Date.now(), token);
      }
    } catch (err) {
      this.cradle.logger.error(`[Paymaster] Mark paymaster cell as spent failed: ${token}`);
      this.captureExceptionToSentryScope(err as Error);
      // XXX: Don't throw the error to avoid the transaction marked as failed
    }
  }
}
