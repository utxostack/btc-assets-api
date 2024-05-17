import container, { Cradle } from '../../src/container';
import { describe, test, beforeEach, afterEach, vi, expect } from 'vitest';
import UTXOSyncer from '../../src/services/utxo';

describe('UTXOSyncer', () => {
  let cradle: Cradle;
  let utxoSyncer: UTXOSyncer;

  beforeEach(async () => {
    cradle = container.cradle;
    utxoSyncer = new UTXOSyncer(cradle);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  test('getRepetStrategy: should be return current time when first run', () => {
    const strategy = UTXOSyncer.getRepeatStrategy(cradle);
    const now = Date.now();
    const excuteAt = strategy(now, { count: 0 });
    expect(excuteAt).toBe(now);
  });

  test('getRepetStrategy: should be exponential increase the repeat interval', () => {
    const strategy = UTXOSyncer.getRepeatStrategy(container.cradle);
    const now = Date.now();
    const excuteAt = strategy(now, { count: 2 });
    expect(excuteAt).toBeGreaterThan(now + cradle.env.UTXO_SYNC_REPEAT_BASE_DURATION * 2 ** 2);
  });

  test('getRepetStrategy: should be return maxDuration when interval is greater than maxDuration', () => {
    const strategy = UTXOSyncer.getRepeatStrategy(container.cradle);
    cradle.env.UTXO_SYNC_REPEAT_MAX_DURATION = 60 * 1000;
    const now = Date.now();
    const excuteAt = strategy(now, { count: 100 });
    expect(excuteAt).toBeGreaterThan(now + cradle.env.UTXO_SYNC_REPEAT_MAX_DURATION);
  });

  test('enqueueSyncJob: should be add job to queue', async () => {
    const spy = vi.spyOn(utxoSyncer, 'addJob');
    await utxoSyncer.enqueueSyncJob('tb1quqtqsh5jrlr9p5wnpu3rs883lqh4avpwc766x3');
    expect(spy).toHaveBeenCalled();
  });

  test('enqueueSyncJob: should not be remove repeat job when enqueued duplicate jobs', async () => {
    await utxoSyncer.enqueueSyncJob('tb1quqtqsh5jrlr9p5wnpu3rs883lqh4avpwc766x3');
    const spy = vi.spyOn(utxoSyncer['queue'], 'removeRepeatableByKey');
    await utxoSyncer.enqueueSyncJob('tb1quqtqsh5jrlr9p5wnpu3rs883lqh4avpwc766x3');
    expect(spy).not.toHaveBeenCalled();
  });

  test('enqueueSyncJob: should be remove repeat job when is exists', async () => {
    await utxoSyncer.enqueueSyncJob('tb1quqtqsh5jrlr9p5wnpu3rs883lqh4avpwc766x3');
    await new Promise((resolve) => setTimeout(resolve, 1100));
    const spy = vi.spyOn(utxoSyncer['queue'], 'removeRepeatableByKey');
    await utxoSyncer.enqueueSyncJob('tb1quqtqsh5jrlr9p5wnpu3rs883lqh4avpwc766x3');
    expect(spy).toHaveBeenCalled();
  });
});
