import { describe, beforeEach, expect, test } from 'vitest';
import TransactionManager, { ITransactionRequest } from '../../src/services/transaction';
import container from '../../src/container';
import { CKBVirtualResult } from '../../src/routes/rgbpp/types';

describe('transactionManager', () => {
  let transactionManager: TransactionManager;
  const cradle = container.cradle;

  beforeEach(async () => {
    transactionManager = new TransactionManager(cradle);
  });

  // test('verifyTransaction: should return true for valid transaction', async () => {
  //   const transactionRequest: ITransactionRequest = {
  //     txid: 'bb8c92f11920824db22b379c0ef491dea2d819e721d5df296bebc67a0568ea0f',
  //     ckbVirtualResult: {
  //       ckbRawTx: {} as CKBVirtualResult['ckbRawTx'],
  //       commitment: 'aa21a9ed91052802a631b93b000202fc252171e0ff0558a0ee5c7a37d89f95afc7306cb7',
  //       sumInputsCapacity: '1000',
  //       needPaymasterCell: false,
  //     },
  //   };
  //   const isValid = await transactionManager.verifyTransaction(transactionRequest);
  //   expect(isValid).toBe(true);
  // });

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
