import { describe, beforeEach, expect, test, vi } from 'vitest';
import TransactionManager, { ITransactionRequest } from '../../src/services/transaction';
import container from '../../src/container';
import { CKBVirtualResult, InputCell, OutputCell } from '../../src/routes/rgbpp/types';
import { Transaction } from '../../src/routes/bitcoin/types';

describe('transactionManager', () => {
  let transactionManager: TransactionManager;
  const cradle = container.cradle;

  beforeEach(async () => {
    transactionManager = new TransactionManager(cradle);
  });

  test('verifyTransaction: should return true for valid transaction', async () => {
    const commitment = 'ed7e717b2ffea6dd89960b05f3a4756077bdbcd9d3db2b7f06100e823aed9b31';
    vi.spyOn(
      transactionManager as unknown as {
        getCommitmentFromBtcTx: (txid: string) => Promise<Buffer>;
      },
      'getCommitmentFromBtcTx',
    ).mockResolvedValueOnce(Buffer.from(commitment, 'hex'));

    const transactionRequest: ITransactionRequest = {
      txid: 'bb8c92f11920824db22b379c0ef491dea2d819e721d5df296bebc67a0568ea0f',
      ckbVirtualResult: {
        ckbRawTx: { inputs: [] as InputCell[], outputs: [] as OutputCell[] } as CKBVirtualResult['ckbRawTx'],
        commitment,
        sumInputsCapacity: '1000',
        needPaymasterCell: false,
      },
    };
    const isValid = await transactionManager.verifyTransaction(transactionRequest);
    expect(isValid).toBe(true);
  });

  test('verifyTransaction: should return false for mismatch commitment', async () => {
    vi.spyOn(
      transactionManager as unknown as {
        getCommitmentFromBtcTx: (txid: string) => Promise<Buffer>;
      },
      'getCommitmentFromBtcTx',
    ).mockResolvedValueOnce(Buffer.from('mismatchcommitment', 'hex'));

    const transactionRequest: ITransactionRequest = {
      txid: 'bb8c92f11920824db22b379c0ef491dea2d819e721d5df296bebc67a0568ea0f',
      ckbVirtualResult: {
        ckbRawTx: { inputs: [] as InputCell[], outputs: [] as OutputCell[] } as CKBVirtualResult['ckbRawTx'],
        commitment: 'ed7e717b2ffea6dd89960b05f3a4756077bdbcd9d3db2b7f06100e823aed9b31',
        sumInputsCapacity: '1000',
        needPaymasterCell: false,
      },
    };
    const isValid = await transactionManager.verifyTransaction(transactionRequest);
    expect(isValid).toBe(false);
  });

  test('verifyTransaction: should return false for mismatch ckb tx', async () => {
    const commitment = 'ed7e717b2ffea6dd89960b05f3a4756077bdbcd9d3db2b7f06100e823aed9b32';
    vi.spyOn(
      transactionManager as unknown as {
        getCommitmentFromBtcTx: (txid: string) => Promise<Buffer>;
      },
      'getCommitmentFromBtcTx',
    ).mockResolvedValueOnce(Buffer.from(commitment, 'hex'));

    const transactionRequest: ITransactionRequest = {
      txid: 'bb8c92f11920824db22b379c0ef491dea2d819e721d5df296bebc67a0568ea0f',
      ckbVirtualResult: {
        ckbRawTx: { inputs: [] as InputCell[], outputs: [] as OutputCell[] } as CKBVirtualResult['ckbRawTx'],
        commitment: 'ed7e717b2ffea6dd89960b05f3a4756077bdbcd9d3db2b7f06100e823aed9b32',
        sumInputsCapacity: '1000',
        needPaymasterCell: false,
      },
    };
    const isValid = await transactionManager.verifyTransaction(transactionRequest);
    expect(isValid).toBe(false);
  });

  test('verifyTransaction: should throw DelayedError for unconfirmed transaction', async () => {
    const commitment = 'ed7e717b2ffea6dd89960b05f3a4756077bdbcd9d3db2b7f06100e823aed9b31';
    vi.spyOn(
      transactionManager as unknown as {
        getCommitmentFromBtcTx: (txid: string) => Promise<Buffer>;
      },
      'getCommitmentFromBtcTx',
    ).mockResolvedValueOnce(Buffer.from(commitment, 'hex'));
    vi.spyOn(transactionManager['cradle']['electrs'], 'getTransaction').mockResolvedValueOnce({
      status: { confirmed: false, block_height: 0 },
    } as unknown as Transaction);

    const transactionRequest: ITransactionRequest = {
      txid: 'bb8c92f11920824db22b379c0ef491dea2d819e721d5df296bebc67a0568ea0f',
      ckbVirtualResult: {
        ckbRawTx: { inputs: [] as InputCell[], outputs: [] as OutputCell[] } as CKBVirtualResult['ckbRawTx'],
        commitment,
        sumInputsCapacity: '1000',
        needPaymasterCell: false,
      },
    };

    await expect(transactionManager.verifyTransaction(transactionRequest)).rejects.toThrowErrorMatchingSnapshot();
  });

  test('enqueueTransaction: should be add transaction request to queue', async () => {
    const transactionRequest: ITransactionRequest = {
      txid: '0x123',
      ckbVirtualResult: {
        ckbRawTx: {} as CKBVirtualResult['ckbRawTx'],
        commitment: '0x123',
        sumInputsCapacity: '1000',
        needPaymasterCell: false,
      },
    };

    transactionManager.enqueueTransaction(transactionRequest);
    const count = await transactionManager['queue'].getJobCounts();
    const job = await transactionManager['queue'].getJob(transactionRequest.txid);
    expect(count.delayed).toBe(1);
    expect(job?.delay).toBe(cradle.env.TRANSACTION_QUEUE_JOB_DELAY);
  });
});
