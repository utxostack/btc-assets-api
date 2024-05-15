import container from '../../src/container';
import { describe, test, beforeEach, afterEach, vi, expect } from 'vitest';
import RgbppCollector from '../../src/services/rgbpp';
import { UTXO } from '../../src/services/bitcoin/schema';
import { Script } from '@ckb-lumos/base';
import { IndexerCell } from '@ckb-lumos/ckb-indexer/lib/type';
import { buildRgbppLockArgs, genRgbppLockScript } from '@rgbpp-sdk/ckb';

const xudtTypeScript = {
  codeHash: '0x25c29dc317811a6f6f3985a7a9ebc4838bd388d19d0feeecf0bcd60f6c0975bb',
  hashType: 'type',
  args: '0x',
};

describe('RgbppCollector', () => {
  let rgbppCollector: RgbppCollector;

  beforeEach(async () => {
    const cradle = container.cradle;
    rgbppCollector = new RgbppCollector(cradle);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  test('getRgbppCellsBatchRequest: should return the batch request for the utxos', () => {
    const utxos: UTXO[] = [
      {
        txid: '0x2c4fa9f077b6bf28ef938414f11609a0620b92f23bf7e6bdcb25cc69d9c4b109',
        vout: 0,
        value: 100000000,
        status: { confirmed: true },
      },
      {
        txid: '0x2c4fa9f077b6bf28ef938414f11609a0620b92f23bf7e6bdcb25cc69d9c4b109',
        vout: 1,
        value: 200000000,
        status: { confirmed: true },
      },
    ];

    const batchRequest = rgbppCollector['getRgbppCellsBatchRequest'](utxos);
    expect(batchRequest).toMatchSnapshot();
  });

  test('getRgbppCellsBatchRequest: should be filtered by typeScript', () => {
    const utxos: UTXO[] = [
      {
        txid: '0x2c4fa9f077b6bf28ef938414f11609a0620b92f23bf7e6bdcb25cc69d9c4b109',
        vout: 0,
        value: 100000000,
        status: { confirmed: true },
      },
      {
        txid: '0x2c4fa9f077b6bf28ef938414f11609a0620b92f23bf7e6bdcb25cc69d9c4b109',
        vout: 1,
        value: 200000000,
        status: { confirmed: true },
      },
    ];

    const typeScript: Script = {
      codeHash: '0x25c29dc317811a6f6f3985a7a9ebc4838bd388d19d0feeecf0bcd60f6c0975bb',
      hashType: 'data',
      args: '0x',
    };

    const batchRequest = rgbppCollector['getRgbppCellsBatchRequest'](utxos, typeScript);
    expect(batchRequest).toMatchSnapshot();
  });

  test('collectRgbppUtxoCellsPairs: should return the utxo and the cells', async () => {
    const utxos: UTXO[] = [
      {
        txid: '0x2c4fa9f077b6bf28ef938414f11609a0620b92f23bf7e6bdcb25cc69d9c4b109',
        vout: 0,
        value: 100000000,
        status: { confirmed: true },
      },
      {
        txid: '0x2c4fa9f077b6bf28ef938414f11609a0620b92f23bf7e6bdcb25cc69d9c4b109',
        vout: 1,
        value: 200000000,
        status: { confirmed: true },
      },
    ];
    vi.spyOn(rgbppCollector, 'getRgbppCellsBatchRequest').mockReturnValue({
      exec: vi.fn().mockResolvedValue([
        {
          objects: [
            {
              blockNumber: '0x123',
              outPoint: {
                txHash: '0x',
                index: '0x0',
              },
              output: {
                lock: genRgbppLockScript(
                  buildRgbppLockArgs(0, '0x2c4fa9f077b6bf28ef938414f11609a0620b92f23bf7e6bdcb25cc69d9c4b109'),
                  false,
                ),
                type: xudtTypeScript,
                capacity: '0x123',
              },
              outputData: '0x',
              txIndex: '0x0',
            },
          ] as IndexerCell[],
        },
        {
          objects: [
            {
              blockNumber: '0x456',
              outPoint: {
                txHash: '0x',
                index: '0x0',
              },
              output: {
                lock: genRgbppLockScript(
                  buildRgbppLockArgs(1, '0x2c4fa9f077b6bf28ef938414f11609a0620b92f23bf7e6bdcb25cc69d9c4b109'),
                  false,
                ),
                type: xudtTypeScript,
                capacity: '0x123',
              },
              outputData: '0x',
              txIndex: '0x0',
            },
          ],
        },
      ]),
    });

    const rgbppUtxoCellsPairs = await rgbppCollector.collectRgbppUtxoCellsPairs(utxos);
    expect(rgbppUtxoCellsPairs).toMatchSnapshot();
  });
});
