import { describe, expect, test } from 'vitest';
import { decodeInfoCellData, decodeUDTHashFromInscriptionData } from '../../src/utils/xudt';

describe('XUDT utils', () => {
  test('decodeInfoCellData: should decode the inscription info cell', async () => {
    const data =
      '0x08094d656d6573436f696e054d454d45538a139905afdd927a56e3dbf2c3993a8d26a69e7ba35f92894460882e3fa6b6ef0040075af0750700000000000000000000ca9a3b00000000000000000000000000';
    const decoded = decodeInfoCellData(data);
    expect(decoded).toEqual({
      decimal: 8,
      name: 'MemesCoin',
      symbol: 'MEMES',
    });
  });

  test('decodeUDTHashFromInscriptionData: should decode the udt_hash from inscription cell data', async () => {
    const data =
      '0x08094d656d6573436f696e054d454d45538a139905afdd927a56e3dbf2c3993a8d26a69e7ba35f92894460882e3fa6b6ef0040075af0750700000000000000000000ca9a3b00000000000000000000000000';
    const decoded = decodeUDTHashFromInscriptionData(data);
    expect(decoded).toEqual('0x8a139905afdd927a56e3dbf2c3993a8d26a69e7ba35f92894460882e3fa6b6ef');
  });
});
