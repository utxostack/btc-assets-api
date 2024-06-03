import { beforeEach, expect, test, vi } from 'vitest';
import { buildFastify } from '../../../src/app';
import { describe } from 'node:test';
import TransactionProcessor, { ITransactionRequest } from '../../../src/services/transaction';
import { CKBVirtualResult } from '../../../src/routes/rgbpp/types';
import { Job } from 'bullmq';

let token: string;

describe('/rgbpp/v1/transaction', () => {
  beforeEach(async () => {
    const fastify = buildFastify();
    await fastify.ready();

    const response = await fastify.inject({
      method: 'POST',
      url: '/token/generate',
      payload: {
        app: 'test',
        domain: 'test.com',
      },
    });
    const data = response.json();
    token = data.token;

    await fastify.close();
  });

  const mockCkbVirtualResult: CKBVirtualResult = {
    ckbRawTx: {
      version: '0x0',
      cellDeps: [
        {
          outPoint: {
            txHash: '0x04c5c3e69f1aa6ee27fb9de3d15a81704e387ab3b453965adbe0b6ca343c6f41',
            index: '0x0',
          },
          depType: 'code',
        },
        {
          outPoint: {
            txHash: '0xc07844ce21b38e4b071dd0e1ee3b0e27afd8d7532491327f39b786343f558ab7',
            index: '0x0',
          },
          depType: 'code',
        },
        {
          outPoint: {
            txHash: '0x04c5c3e69f1aa6ee27fb9de3d15a81704e387ab3b453965adbe0b6ca343c6f41',
            index: '0x1',
          },
          depType: 'code',
        },
      ],
      headerDeps: [],
      inputs: [
        {
          previousOutput: {
            txHash: '0x56756961892340bb675138fb4a4055a97b340179530cd9c508f601a821ce28b8',
            index: '0x0',
          },
          since: '0x0',
        },
      ],
      outputs: [
        {
          capacity: '0x5e9f5203e',
          lock: {
            codeHash: '0xbc6c568a1a0d0a09f6844dc9d74ddb4343c32143ff25f727c59edf4fb72d6936',
            args: '0x010000000000000000000000000000000000000000000000000000000000000000000000',
            hashType: 'type',
          },
          type: {
            codeHash: '0x50bd8d6680b8b9cf98b73f3c08faf8b2a21914311954118ad6609be6e78a1b95',
            args: '0x2ae639d6233f9b15545573b8e78f38ff7aa6c7bf8ef6460bf1f12d0a76c09c4e',
            hashType: 'data1',
          },
        },
      ],
      outputsData: ['0x00e87648170000000000000000000000'],
      witnesses: ['0xFF'],
    },
    commitment: '1f434e4bc1eb8ccb9ac37fd018dcb6989ac1a95ae340db96a030822bd2f268ed',
    needPaymasterCell: false,
    sumInputsCapacity: '0x5e9f52f1f',
  };

  test('Get transaction job info with completed state', async () => {
    const fastify = buildFastify();
    await fastify.ready();

    const transactionProcessor: TransactionProcessor = fastify.container.resolve('transactionProcessor');

    vi.spyOn(transactionProcessor, 'getTransactionRequest').mockResolvedValue({
      getState: vi.fn().mockResolvedValue('completed'),
      attemptsMade: 1,
      data: {
        txid: 'ccee39f38e5ad162c21a44bc6add20577811f13e35575fcb9103ef725a73c79d',
        ckbVirtualResult: mockCkbVirtualResult,
      },
    } as unknown as Job<ITransactionRequest, unknown, string>);

    const response = await fastify.inject({
      method: 'GET',
      url: '/rgbpp/v1/transaction/ccee39f38e5ad162c21a44bc6add20577811f13e35575fcb9103ef725a73c79d/job',
      headers: {
        Authorization: `Bearer ${token}`,
        Origin: 'https://test.com',
      },
    });
    const data = response.json();

    expect(response.statusCode).toBe(200);
    expect(data).toEqual({
      state: 'completed',
      attempts: 1,
    });

    await fastify.close();
  });

  test('Get transaction job info with failed state', async () => {
    const fastify = buildFastify();
    await fastify.ready();

    const transactionProcessor: TransactionProcessor = fastify.container.resolve('transactionProcessor');

    vi.spyOn(transactionProcessor, 'getTransactionRequest').mockResolvedValue({
      getState: vi.fn().mockResolvedValue('failed'),
      attemptsMade: 1,
      failedReason: 'Failed to send transaction',
      data: {
        txid: 'ccee39f38e5ad162c21a44bc6add20577811f13e35575fcb9103ef725a73c79d',
        ckbVirtualResult: mockCkbVirtualResult,
      },
    } as unknown as Job<ITransactionRequest, unknown, string>);

    const response = await fastify.inject({
      method: 'GET',
      url: '/rgbpp/v1/transaction/ccee39f38e5ad162c21a44bc6add20577811f13e35575fcb9103ef725a73c79d/job',
      headers: {
        Authorization: `Bearer ${token}`,
        Origin: 'https://test.com',
      },
    });
    const data = response.json();

    expect(response.statusCode).toBe(200);
    expect(data).toEqual({
      state: 'failed',
      attempts: 1,
      failedReason: 'Failed to send transaction',
    });

    await fastify.close();
  });

  test('Get transaction job info with data', async () => {
    const fastify = buildFastify();
    await fastify.ready();

    const transactionProcessor: TransactionProcessor = fastify.container.resolve('transactionProcessor');

    vi.spyOn(transactionProcessor, 'getTransactionRequest').mockResolvedValue({
      getState: vi.fn().mockResolvedValue('completed'),
      attemptsMade: 1,
      data: {
        txid: 'ccee39f38e5ad162c21a44bc6add20577811f13e35575fcb9103ef725a73c79d',
        ckbVirtualResult: mockCkbVirtualResult,
      },
    } as unknown as Job<ITransactionRequest, unknown, string>);

    const response = await fastify.inject({
      method: 'GET',
      url: '/rgbpp/v1/transaction/ccee39f38e5ad162c21a44bc6add20577811f13e35575fcb9103ef725a73c79d/job?with_data=true',
      headers: {
        Authorization: `Bearer ${token}`,
        Origin: 'https://test.com',
      },
    });
    const data = response.json();

    expect(response.statusCode).toBe(200);
    expect(data).toEqual({
      state: 'completed',
      attempts: 1,
      data: {
        txid: 'ccee39f38e5ad162c21a44bc6add20577811f13e35575fcb9103ef725a73c79d',
        ckbVirtualResult: mockCkbVirtualResult,
      },
    });

    await fastify.close();
  });
});
