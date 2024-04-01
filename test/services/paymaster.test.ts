/* eslint-disable @typescript-eslint/ban-ts-comment */
import container from '../../src/container';
import Paymaster from '../../src/services/paymaster';
import { Cell, hd } from '@ckb-lumos/lumos';
import { describe, beforeEach, expect, test, vi } from 'vitest';
import { Job } from 'bullmq';
import { asValue } from 'awilix';

const { mnemonic, ExtendedPrivateKey, AddressType } = hd;

function generatePrivateKey() {
  const myMnemonic = mnemonic.generateMnemonic();
  const seed = mnemonic.mnemonicToSeedSync(myMnemonic);
  const extendedPrivKey = ExtendedPrivateKey.fromSeed(seed);
  return extendedPrivKey.privateKeyInfo(AddressType.Receiving, 0).privateKey;
}

describe('Paymaster', () => {
  let paymaster: Paymaster;

  beforeEach(async () => {
    const cradle = container.cradle;
    cradle.env.PAYMASTER_PRIVATE_KEY = generatePrivateKey();
    cradle.env.PAYMASTER_CELL_CAPACITY = 10;
    cradle.env.PAYMASTER_CELL_PRESET_COUNT = 10;
    cradle.env.PAYMASTER_CELL_REFILL_THRESHOLD = 0.3;

    paymaster = new Paymaster(cradle);
  });

  test('getNextCell: should not trigger refill if already refilling', async () => {
    paymaster['refilling'] = true;
    vi.spyOn(paymaster['queue'], 'getWaitingCount').mockResolvedValue(2);
    vi.spyOn(paymaster, 'refillCellQueue');

    await paymaster.getNextCell('token');
    expect(paymaster.refillCellQueue).not.toHaveBeenCalled();
  });

  test('getNextCell: should return the next job when queue has sufficient jobs', async () => {
    container.register('ckbRpc', asValue({
      getLiveCell: vi.fn().mockResolvedValue({
        status: 'live',
      }),
    }));
    vi.spyOn(paymaster['queue'], 'getWaitingCount').mockResolvedValue(10);
    vi.spyOn(paymaster['worker'], 'getNextJob').mockResolvedValue(
      new Job(paymaster['queue'], 'test-job', { outPoint: {}, cellOutput: {}, data: '0x123' }) as Job<Cell>,
    );
    vi.spyOn(paymaster, 'refillCellQueue');

    const cell = await paymaster.getNextCell('token');
    expect(cell?.outputData).toEqual('0x123');
    expect(paymaster.refillCellQueue).not.toHaveBeenCalled();
    expect(paymaster['refilling']).toBeFalsy();
  });

  test('getNextCell: should trigger refill when queue has fewer jobs than threshold', async () => {
    container.register('ckbRpc', asValue({
      getLiveCell: vi.fn().mockResolvedValue({
        status: 'live',
      }),
    }));
    vi.spyOn(paymaster['queue'], 'getWaitingCount').mockResolvedValue(2);
    vi.spyOn(paymaster, 'refillCellQueue').mockResolvedValue(8);
    vi.spyOn(paymaster['worker'], 'getNextJob').mockResolvedValue(
      new Job(paymaster['queue'], 'test-job', { outPoint: {}, cellOutput: {}, data: '0x123' }) as Job<Cell>,
    );

    const cell = await paymaster.getNextCell('token');
    expect(cell?.outputData).toEqual('0x123');
    expect(paymaster.refillCellQueue).toHaveBeenCalled();
  });

  test('getNextCell: should return a job when queue is empty and refill is successful', async () => {
    vi.spyOn(paymaster['queue'], 'getWaitingCount').mockResolvedValue(0);
    vi.spyOn(paymaster, 'refillCellQueue').mockResolvedValue(1);
    vi.spyOn(paymaster['worker'], 'getNextJob').mockResolvedValue(
      new Job(paymaster['queue'], 'refilled-job', {}) as Job<Cell>,
    );

    await paymaster.getNextCell('token');
    expect(paymaster.refillCellQueue).toHaveBeenCalled();
  });

  test('getNextCell: should handle error when queue is empty and refill fails', async () => {
    vi.spyOn(paymaster['queue'], 'getWaitingCount').mockResolvedValue(0);
    vi.spyOn(paymaster, 'refillCellQueue').mockRejectedValue(new Error('Refill failed'));
    vi.spyOn(paymaster['worker'], 'getNextJob');

    await expect(paymaster.getNextCell('token')).rejects.toThrow('Refill failed');
    expect(paymaster.refillCellQueue).toHaveBeenCalled();
    expect(paymaster['worker'].getNextJob).not.toHaveBeenCalled();
  });

  test('refillCellQueue: should add cells to the queue successfully', async () => {
    const mockCells: Cell[] = [
      {
        cellOutput: {
          capacity: '0xa',
          lock: paymaster['lockScript'],
        },
        outPoint: {
          txHash: '0x123',
          index: '0x0',
        },
        data: '0x',
      },
      {
        cellOutput: {
          capacity: '0xa',
          lock: paymaster['lockScript'],
        },
        outPoint: {
          txHash: '0x456',
          index: '0x0',
        },
        data: '0x',
      },
    ];
    const mockCollector = {
      collect: async function* () {
        yield* mockCells;
      },
    };
    vi.spyOn(paymaster['cradle'].ckbIndexer, 'collector').mockReturnValue(mockCollector);
    vi.spyOn(paymaster['queue'], 'getWaitingCount').mockResolvedValue(9);
    vi.spyOn(paymaster['queue'], 'add');

    const filled = await paymaster.refillCellQueue();
    expect(filled).toBe(1);
    expect(paymaster['queue'].add).toHaveBeenCalledTimes(1);
  });

  test('refillCellQueue: should return 0 when no cells are found to add', async () => {
    const mockCollector = {
      collect: async function* () {
        // No cells yielded
      },
    };
    vi.spyOn(paymaster['cradle'].ckbIndexer, 'collector').mockReturnValue(mockCollector);
    vi.spyOn(paymaster['queue'], 'add');

    const filled = await paymaster.refillCellQueue();
    expect(filled).toBe(0);
    expect(paymaster['queue'].add).not.toHaveBeenCalled();
  });
});
