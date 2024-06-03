import container from '../../src/container';
import { describe, test, beforeEach, afterEach, vi, expect } from 'vitest';
import RgbppCollector from '../../src/services/rgbpp';
import { Cell, Script } from '@ckb-lumos/base';
import mockUtxos from '../__fixtures__/utxo.mock.json';
import mockRgbppUtxoPairs from '../__fixtures__/rgbpp-utxo-pairs.mock.json';

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
    const cells = await rgbppCollector.getRgbppCellsByBatchRequest(mockUtxos);
    expect(cells).toMatchSnapshot();
  });

  test('getRgbppCellsByBatchRequest: should be filtered by typeScript', async () => {
    const typeScript: Script = {
      codeHash: '0x25c29dc317811a6f6f3985a7a9ebc4838bd388d19d0feeecf0bcd60f6c0975bb',
      hashType: 'type',
      args: '0xc625c4ac0ba3ece5886d04958c3fc2d5558a21841c03577fad2d7c46e5b2b2b9',
    };

    const cells = await rgbppCollector.getRgbppCellsByBatchRequest(mockUtxos, typeScript);
    expect(cells).toMatchSnapshot();
  });

  test('getRgbppCellsByBatchRequest: should return the utxo and the cells', async () => {
    const rgbppUtxoCellsPairs = await rgbppCollector.collectRgbppUtxoCellsPairs(mockUtxos);
    expect(rgbppUtxoCellsPairs).toMatchSnapshot();
  });

  test('getRgbppBalanceByCells: should return the rgbpp balance by cells', async () => {
    const cells = mockRgbppUtxoPairs.map((pair) => pair.cells).flat();
    const balance = await rgbppCollector.getRgbppBalanceByCells(cells as Cell[]);
    expect(balance).toMatchSnapshot();
  });
});
