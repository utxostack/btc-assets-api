import { describe, expect, test } from 'vitest';
import { decodeUDTHashFromInscriptionData } from '../../src/utils/xudt';
import { decodeMetadata, decodeTokenInfo } from '@utxostack/metadata';

describe('XUDT utils', () => {
  test('decodeTokenInfo: should decode the inscription info cell', async () => {
    const data1 = '0x08094d656d6573436f696e054d454d4553';
    const decoded1 = decodeTokenInfo(data1);
    expect(decoded1).toEqual({
      decimal: 8,
      name: 'MemesCoin',
      symbol: 'MEMES',
    });

    const data2 = '0x08094d656d6573436f696e054d454d455301000000100000000040075af07507000000000000000000';
    const decoded2 = decodeTokenInfo(data2);
    expect(decoded2).toEqual({
      decimal: 8,
      name: 'MemesCoin',
      symbol: 'MEMES',
      totalSupply: '0x775f05a074000',
    });
  });

  test('decodeMetadata: should decode the token metadata', async () => {
    const data =
      '0x04000000200000000f251aec82b7d329bfe94ac8456fd96c463248aec5551b18fd215ca5dcb94be70300000020000000a8efe3e8d534fbad88251c1f82cf2428f87637a27cfbf28b6365e9b74d895d1802000000100000000000a40731af05000000000000000000';
    const decoded = decodeMetadata(data);
    expect(decoded).toEqual({
      issuer: '0xa8efe3e8d534fbad88251c1f82cf2428f87637a27cfbf28b6365e9b74d895d18',
      circulatingSupply: `0x${BigInt(1600_0000_0000_0000).toString(16)}`,
      tokenInfoCellTypeHash: '0x0f251aec82b7d329bfe94ac8456fd96c463248aec5551b18fd215ca5dcb94be7',
    });
  });

  test('decodeUDTHashFromInscriptionData: should decode the udt_hash from inscription cell data', async () => {
    const data =
      '0x08094d656d6573436f696e054d454d45538a139905afdd927a56e3dbf2c3993a8d26a69e7ba35f92894460882e3fa6b6ef0040075af0750700000000000000000000ca9a3b00000000000000000000000000';
    const decoded = decodeUDTHashFromInscriptionData(data);
    expect(decoded).toEqual('0x8a139905afdd927a56e3dbf2c3993a8d26a69e7ba35f92894460882e3fa6b6ef');
  });
});
