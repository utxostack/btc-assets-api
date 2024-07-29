import container from '../../src/container';
import { describe, test, beforeEach, afterEach, vi, expect } from 'vitest';
import CKBClient from '../../src/services/ckb';
import { isInscriptionInfoTypeScript, isUniqueCellTypeScript } from '../../src/utils/xudt';
import { Script } from '@ckb-lumos/lumos';

describe('CKBClient', () => {
  let ckb: CKBClient;

  beforeEach(async () => {
    const cradle = container.cradle;
    ckb = new CKBClient(cradle);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // PDD
  const xudtTypeScript: Script = {
    codeHash: '0x25c29dc317811a6f6f3985a7a9ebc4838bd388d19d0feeecf0bcd60f6c0975bb',
    args: '0x8c556e92974a8dd8237719020a259d606359ac2cc958cb8bda77a1c3bb3cd93b',
    hashType: 'type',
  };

  // {"name":"tUTXO","symbol":"tUTXO","decimal":8}
  const tUtxoTypeScript: Script = {
    codeHash: '0x25c29dc317811a6f6f3985a7a9ebc4838bd388d19d0feeecf0bcd60f6c0975bb',
    args: '0x92b419a8d8e03c683a47b960f707f2b866f6114b70327b6628762719b243c5ca',
    hashType: 'type',
  };

  // CKBI
  const inscriptionTypeScript: Script = {
    codeHash: '0x25c29dc317811a6f6f3985a7a9ebc4838bd388d19d0feeecf0bcd60f6c0975bb',
    args: '0x1ba116c119d1cfd98a53e9d1a615cf2af2bb87d95515c9d217d367054cfc696b',
    hashType: 'type',
  };

  // MEMES
  const inscriptionRebaseTypeScript: Script = {
    codeHash: '0x25c29dc317811a6f6f3985a7a9ebc4838bd388d19d0feeecf0bcd60f6c0975bb',
    args: '0xe6cd7bc3111c0f1edc91efe8e13be24e611653c3633c3fbe97f823eeef8e5d3c',
    hashType: 'type',
  };

  test('getUniqueCellData: should return the unique cell data', async () => {
    // PDD (Unique cell transaction)
    const tx = await ckb.rpc.getTransaction('0x6a35da16ab1198008545c78b91abe22999f0dc823055553a13d7de29f3063111');
    const index = tx.transaction.outputs.findIndex(
      (output) => output.type && isUniqueCellTypeScript(output.type, false),
    );
    const data = ckb.getUniqueCellData(tx, index, xudtTypeScript);
    expect(data).toEqual({
      decimal: 8,
      name: 'XUDT Test Token',
      symbol: 'PDD',
    });
  });

  test('getInfoCellData: should return the info cell data', async () => {
    // related tx:
    // https://pudge.explorer.nervos.org/transaction/0x38f88df8b0ce98ec0dee86249c8640b06439105a2500b4ca0638a1a229a52a48
    const infoCellData = await ckb.getInfoCellData(tUtxoTypeScript);
    expect(infoCellData).toEqual({
      decimal: 8,
      name: 'tUTXO',
      symbol: 'tUTXO',
    });
  });

  test('getInscriptionCellData: should return the inscription cell data (before rebase)', async () => {
    // CKBI (Inscription cell transaction)
    const tx = await ckb.rpc.getTransaction('0xd1195131f13eca1b4ec1c4b58f7a16f27a239b1064270d703d0c3eb5b6c1b332');
    const index = tx.transaction.outputs.findIndex(
      (output) => output.type && isInscriptionInfoTypeScript(output.type, false),
    );
    const data = ckb.getInscriptionInfoCellData(tx, index, inscriptionTypeScript);
    expect(data).toEqual({
      decimal: 8,
      name: 'CKB Fist Inscription',
      symbol: 'CKBI',
    });
  });

  test('getInscriptionCellData: should return the inscription cell data (after rebase)', async () => {
    // MEMES (Inscription cell transaction (rebased))
    const tx = await ckb.rpc.getTransaction('0xf1a0413641d84fc86e4ea3d55178c6f181538347cea47dc27f35c50ff8b4ec19');
    const index = tx.transaction.outputs.findIndex(
      (output) => output.type && isInscriptionInfoTypeScript(output.type, false),
    );
    const data = ckb.getInscriptionInfoCellData(tx, index, inscriptionRebaseTypeScript);
    expect(data).toEqual({
      decimal: 8,
      name: 'MemesCoin',
      symbol: 'MEMES',
    });
  });

  test('getInscriptionCellData: should not return the inscription cell data by incorrect tx', async () => {
    // MEMES (Inscription cell transaction (rebased))
    const tx = await ckb.rpc.getTransaction('0xe402f225dd76103fa720f41e6bc3a49329d4e3732863b6f32d2ab19f3c6569b6');
    const index = tx.transaction.outputs.findIndex(
      (output) => output.type && isInscriptionInfoTypeScript(output.type, false),
    );
    const data = ckb.getInscriptionInfoCellData(tx, index, inscriptionRebaseTypeScript);
    expect(data).toBeNull();
  });
});
