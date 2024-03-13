import container from '../../src/container';
import Paymaster from '../../src/services/paymaster';
import { Cell, hd } from '@ckb-lumos/lumos';
import { describe, beforeEach, expect, test, vi } from 'vitest';
import { Job } from 'bullmq';

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

  test('getNextCellJob: should not trigger refill if already refilling', async () => {
    paymaster['refilling'] = true;
    vi.spyOn(paymaster['queue'], 'getWaitingCount').mockResolvedValue(2);
    vi.spyOn(paymaster, 'refillCellQueue');

    await paymaster.getNextCellJob('token');
    expect(paymaster.refillCellQueue).not.toHaveBeenCalled();
  });

  test('getNextCellJob: should return the next job when queue has sufficient jobs', async () => {
    vi.spyOn(paymaster['queue'], 'getWaitingCount').mockResolvedValue(10);
    vi.spyOn(paymaster['worker'], 'getNextJob').mockResolvedValue(
      new Job(paymaster['queue'], 'test-job', {}) as Job<Cell>,
    );
    vi.spyOn(paymaster, 'refillCellQueue');

    const job = await paymaster.getNextCellJob('token');
    expect(job).toBeInstanceOf(Job);
    expect(paymaster.refillCellQueue).not.toHaveBeenCalled();
    expect(paymaster['refilling']).toBeFalsy();
  });

  test('getNextCellJob: should trigger refill when queue has fewer jobs than threshold', async () => {
    vi.spyOn(paymaster['queue'], 'getWaitingCount').mockResolvedValue(2);
    vi.spyOn(paymaster, 'refillCellQueue').mockResolvedValue(8);
    vi.spyOn(paymaster['worker'], 'getNextJob').mockResolvedValue(
      new Job(paymaster['queue'], 'test-job', {}) as Job<Cell>,
    );

    const job = await paymaster.getNextCellJob('token');
    expect(job).toBeInstanceOf(Job);
    expect(paymaster.refillCellQueue).toHaveBeenCalled();
  });

  test('getNextCellJob: should return a job when queue is empty and refill is successful', async () => {
    vi.spyOn(paymaster['queue'], 'getWaitingCount').mockResolvedValue(0);
    vi.spyOn(paymaster, 'refillCellQueue').mockResolvedValue(1);
    vi.spyOn(paymaster['worker'], 'getNextJob').mockResolvedValue(
      new Job(paymaster['queue'], 'refilled-job', {}) as Job<Cell>,
    );

    const job = await paymaster.getNextCellJob('token');
    expect(job).toBeInstanceOf(Job);
    expect(job?.name).toBe('refilled-job');
    expect(paymaster.refillCellQueue).toHaveBeenCalled();
  });

  test('getNextCellJob: should handle error when queue is empty and refill fails', async () => {
    vi.spyOn(paymaster['queue'], 'getWaitingCount').mockResolvedValue(0);
    vi.spyOn(paymaster, 'refillCellQueue').mockRejectedValue(new Error('Refill failed'));
    vi.spyOn(paymaster['worker'], 'getNextJob');

    await expect(paymaster.getNextCellJob('token')).rejects.toThrow('Refill failed');
    expect(paymaster.refillCellQueue).toHaveBeenCalled();
    expect(paymaster['worker'].getNextJob).not.toHaveBeenCalled();
  });
});
