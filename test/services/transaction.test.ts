import { describe, beforeEach, expect, test, vi } from 'vitest';
import TransactionProcessor, { ITransactionRequest } from '../../src/services/transaction';
import container from '../../src/container';
import { CKBVirtualResult, InputCell, OutputCell } from '../../src/routes/rgbpp/types';
import { ChainInfo, Transaction } from '../../src/routes/bitcoin/types';
import { calculateCommitment } from '@rgbpp-sdk/ckb/lib/utils/rgbpp';
import { Job } from 'bullmq';

const commitment = calculateCommitment({
  inputs: [] as InputCell[],
  outputs: [] as OutputCell[],
} as CKBVirtualResult['ckbRawTx']);

describe('transactionProcessor', () => {
  let transactionProcessor: TransactionProcessor;
  const cradle = container.cradle;

  beforeEach(async () => {
    transactionProcessor = new TransactionProcessor(cradle);
  });

  test('verifyTransaction: should return true for valid transaction', async () => {
    vi.spyOn(
      transactionProcessor as unknown as {
        getCommitmentFromBtcTx: (txid: string) => Buffer;
      },
      'getCommitmentFromBtcTx',
    ).mockReturnValueOnce(Buffer.from(commitment, 'hex'));

    const transactionRequest: ITransactionRequest = {
      txid: 'bb8c92f11920824db22b379c0ef491dea2d819e721d5df296bebc67a0568ea0f',
      ckbVirtualResult: {
        ckbRawTx: { inputs: [] as InputCell[], outputs: [] as OutputCell[] } as CKBVirtualResult['ckbRawTx'],
        commitment,
        sumInputsCapacity: '1000',
        needPaymasterCell: false,
      },
    };
    const btcTx = await cradle.bitcoin.getTx({ txid: transactionRequest.txid });
    const isValid = await transactionProcessor.verifyTransaction(transactionRequest, btcTx);
    expect(isValid).toBe(true);
  });

  test('verifyTransaction: should return false for mismatch commitment', async () => {
    vi.spyOn(
      transactionProcessor as unknown as {
        getCommitmentFromBtcTx: (txid: string) => Buffer;
      },
      'getCommitmentFromBtcTx',
    ).mockReturnValueOnce(Buffer.from('mismatchcommitment', 'hex'));

    const transactionRequest: ITransactionRequest = {
      txid: 'bb8c92f11920824db22b379c0ef491dea2d819e721d5df296bebc67a0568ea0f',
      ckbVirtualResult: {
        ckbRawTx: { inputs: [] as InputCell[], outputs: [] as OutputCell[] } as CKBVirtualResult['ckbRawTx'],
        commitment,
        sumInputsCapacity: '1000',
        needPaymasterCell: false,
      },
    };
    const btcTx = await cradle.bitcoin.getTx({ txid: transactionRequest.txid });
    const isValid = await transactionProcessor.verifyTransaction(transactionRequest, btcTx);
    expect(isValid).toBe(false);
  });

  test('verifyTransaction: should return false for mismatch ckb tx', async () => {
    const commitment = 'mismatchcommitment';
    vi.spyOn(
      transactionProcessor as unknown as {
        getCommitmentFromBtcTx: (txid: string) => Buffer;
      },
      'getCommitmentFromBtcTx',
    ).mockReturnValueOnce(Buffer.from(commitment, 'hex'));

    const transactionRequest: ITransactionRequest = {
      txid: 'bb8c92f11920824db22b379c0ef491dea2d819e721d5df296bebc67a0568ea0f',
      ckbVirtualResult: {
        ckbRawTx: { inputs: [] as InputCell[], outputs: [] as OutputCell[] } as CKBVirtualResult['ckbRawTx'],
        commitment,
        sumInputsCapacity: '1000',
        needPaymasterCell: false,
      },
    };
    const btcTx = await cradle.bitcoin.getTx({ txid: transactionRequest.txid });
    const isValid = await transactionProcessor.verifyTransaction(transactionRequest, btcTx);
    expect(isValid).toBe(false);
  });

  test('verifyTransaction: should throw TransactionNotConfirmedError for unconfirmed transaction', async () => {
    vi.spyOn(
      transactionProcessor as unknown as {
        getCommitmentFromBtcTx: (txid: string) => Buffer;
      },
      'getCommitmentFromBtcTx',
    ).mockReturnValueOnce(Buffer.from(commitment, 'hex'));
    vi.spyOn(transactionProcessor['cradle']['bitcoin'], 'getTx').mockResolvedValueOnce({
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

    const btcTx = await cradle.bitcoin.getTx({ txid: transactionRequest.txid });
    await expect(
      transactionProcessor.verifyTransaction(transactionRequest, btcTx),
    ).rejects.toThrowErrorMatchingSnapshot();
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

    await transactionProcessor.enqueueTransaction(transactionRequest);
    const jobs = await transactionProcessor['queue'].getJobs('delayed');
    const jobFromApi = await transactionProcessor['queue'].getJob(transactionRequest.txid);
    const jobFromList = jobs.find((row) => row.id === transactionRequest.txid);

    expect(jobFromApi).toBeDefined();
    expect(jobFromApi!.id).toStrictEqual(jobFromList?.id);
    expect(jobFromApi!.delay).toBe(cradle.env.TRANSACTION_QUEUE_JOB_DELAY);
  });

  test('retryMissingTransactions: should be retry transaction job when missing', async () => {
    vi.spyOn(cradle.bitcoin, 'getBlockchainInfo').mockResolvedValue({
      blocks: 123456,
    } as unknown as ChainInfo);
    vi.spyOn(cradle.bitcoin, 'getBlockHeight').mockResolvedValue('00000000abcdefghijklmnopqrstuvwxyz');
    vi.spyOn(cradle.bitcoin, 'getBlockTxids').mockResolvedValue([
      'bb8c92f11920824db22b379c0ef491dea2d819e721d5df296bebc67a0568ea0f',
      '8ea0fbb8c92f11920824db22b379c0ef491dea2d819e721d5df296bebc67a056',
      '8eb22b379c0ef491dea2d819e721d5df296bebc67a056a0fbb8c92f11920824d',
    ]);
    const retry = vi.fn();
    vi.spyOn(transactionProcessor['queue'], 'getJobs').mockResolvedValue([
      {
        id: 'bb8c92f11920824db22b379c0ef491dea2d819e721d5df296bebc67a0568ea0f',
        retry,
      } as unknown as Job,
    ]);

    await transactionProcessor.retryMissingTransactions();

    expect(retry).toHaveBeenCalled();
  });

  test('retryMissingTransactions: should not retry transaction job when not match', async () => {
    vi.spyOn(cradle.bitcoin, 'getBlockchainInfo').mockResolvedValue({
      blocks: 123456,
    } as unknown as ChainInfo);
    vi.spyOn(cradle.bitcoin, 'getBlockHeight').mockResolvedValue('00000000abcdefghijklmnopqrstuvwxyz');
    vi.spyOn(cradle.bitcoin, 'getBlockTxids').mockResolvedValue([
      'bb8c92f11920824db22b379c0ef491dea2d819e721d5df296bebc67a0568ea0f',
      '8ea0fbb8c92f11920824db22b379c0ef491dea2d819e721d5df296bebc67a056',
      '8eb22b379c0ef491dea2d819e721d5df296bebc67a056a0fbb8c92f11920824d',
    ]);
    const retry = vi.fn();
    vi.spyOn(transactionProcessor['queue'], 'getJobs').mockResolvedValue([
      {
        id: 'bb8c92f119208248ea0fdb22b379c0ef491dea2d819e721d5df296bebc67a056',
        retry,
      } as unknown as Job,
    ]);

    await transactionProcessor.retryMissingTransactions();

    expect(retry).not.toHaveBeenCalled();
  });
});
