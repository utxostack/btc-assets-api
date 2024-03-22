/* eslint-disable @typescript-eslint/ban-ts-comment */
import container from '../../src/container';
import { describe, test, beforeEach, vi, expect, afterEach } from 'vitest';
import Unlocker from '../../src/services/unlocker';
import { Cell } from '@ckb-lumos/lumos';
import { BTCTimeLock, genBtcTimeLockScript } from '@rgbpp-sdk/ckb';

describe('Unlocker', () => {
  let unlocker: Unlocker;

  beforeEach(async () => {
    const cradle = container.cradle;
    // TODO: mock env.TRANSACTION_SPV_SERVICE_URL
    unlocker = new Unlocker(cradle);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  function mockBtcTimeLockCell() {
    vi.spyOn(BTCTimeLock, 'unpack').mockReturnValue({
      after: 6,
      btcTxid: '0x12345',
      lockScript: {} as unknown as CKBComponents.Script,
    });
    vi.spyOn(unlocker['collector'], 'collect').mockImplementation(async function* () {
      const toLock: CKBComponents.Script = {
        args: '0xc0a45d9d7c024adcc8076c18b3f07c08de7c42120cdb7e6cbc05a28266b15b5f',
        codeHash: '0x28e83a1277d48add8e72fadaa9248559e1b632bab2bd60b27955ebc4c03800a5',
        hashType: 'data',
      };
      yield {
        blockNumber: '0x123',
        outPoint: {
          txHash: '0x',
          index: '0x0',
        },
        cellOutput: {
          lock: genBtcTimeLockScript(toLock, false),
          capacity: '0x123',
        },
        data: '0x',
      } as Cell;
      yield {
        blockNumber: '0x456',
        outPoint: {
          txHash: '0x',
          index: '0x0',
        },
        cellOutput: {
          lock: genBtcTimeLockScript(toLock, false),
          capacity: '0x456',
        },
        data: '0x',
      } as Cell;
    });
  }

  test('getNextBatchLockCell: should skip unconfirmed btc tx', async () => {
    // @ts-expect-error
    vi.spyOn(unlocker['cradle'].bitcoind, 'getBlockchainInfo').mockResolvedValue({ blocks: 100 });
    // @ts-expect-error
    vi.spyOn(unlocker['cradle'].bitcoind, 'getTransaction').mockResolvedValue({ blockheight: 95 });
    mockBtcTimeLockCell();

    const cells = await unlocker.getNextBatchLockCell();
    expect(cells).toHaveLength(0);
  });

  test('getNextBatchLockCell: should return cells when btc tx is confirmed', async () => {
    // @ts-expect-error
    vi.spyOn(unlocker['cradle'].bitcoind, 'getBlockchainInfo').mockResolvedValue({ blocks: 101 });
    // @ts-expect-error
    vi.spyOn(unlocker['cradle'].bitcoind, 'getTransaction').mockResolvedValue({ blockheight: 95 });
    mockBtcTimeLockCell();

    const cells = await unlocker.getNextBatchLockCell();
    expect(cells).toHaveLength(2);
  });

  test('getNextBatchLockCell: should break when cells reach batch size', async () => {
    unlocker['cradle'].env.UNLOCKER_CELL_BATCH_SIZE = 1;

    // @ts-expect-error
    vi.spyOn(unlocker['cradle'].bitcoind, 'getBlockchainInfo').mockResolvedValue({ blocks: 101 });
    // @ts-expect-error
    vi.spyOn(unlocker['cradle'].bitcoind, 'getTransaction').mockResolvedValue({ blockheight: 95 });
    mockBtcTimeLockCell();

    const cells = await unlocker.getNextBatchLockCell();
    expect(cells).toHaveLength(1);
  });
});
