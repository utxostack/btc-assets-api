import container from '../../src/container';
import { describe, test, beforeEach, afterEach, vi, expect } from 'vitest';
import RgbppCollector from '../../src/services/rgbpp';
import { UTXO } from '../../src/services/bitcoin/schema';
import { Script } from '@ckb-lumos/base';
// import { IndexerCell } from '@ckb-lumos/ckb-indexer/lib/type';
// import { buildRgbppLockArgs, genRgbppLockScript } from '@rgbpp-sdk/ckb';

// const xudtTypeScript = {
//   codeHash: '0x25c29dc317811a6f6f3985a7a9ebc4838bd388d19d0feeecf0bcd60f6c0975bb',
//   hashType: 'type',
//   args: '0x',
// };

describe('RgbppCollector', () => {
  let rgbppCollector: RgbppCollector;

  beforeEach(async () => {
    const cradle = container.cradle;
    rgbppCollector = new RgbppCollector(cradle);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  test('getRgbppCellsByBatchRequest: should return the batch request for the utxos', async () => {
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

    const cells = await rgbppCollector.getRgbppCellsByBatchRequest(utxos);
    expect(cells).toMatchSnapshot();
  });

  test('getRgbppCellsByBatchRequest: should be filtered by typeScript', async () => {
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

    const cells = await rgbppCollector.getRgbppCellsByBatchRequest(utxos, typeScript);
    expect(cells).toMatchSnapshot();
  });

  test('getRgbppCellsByBatchRequest: should return the utxo and the cells', async () => {
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
    const rgbppUtxoCellsPairs = await rgbppCollector.collectRgbppUtxoCellsPairs(utxos);
    expect(rgbppUtxoCellsPairs).toMatchSnapshot();
  });
});
