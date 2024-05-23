import { BI } from '@ckb-lumos/lumos';
import { remove0x } from '@rgbpp-sdk/btc';
import { getUniqueTypeScript, hexToUtf8 } from '@rgbpp-sdk/ckb';

// https://github.com/ckb-cell/unique-cell?tab=readme-ov-file#xudt-information
export function decodeUniqueCellData(data: string) {
  const hex = remove0x(data);
  const decimal = BI.from(`0x${hex.slice(0, 2)}`).toNumber();
  const nameSize = BI.from(`0x${hex.slice(2, 4)}`).toNumber() * 2;
  const name = hexToUtf8(`0x${hex.slice(4, 4 + nameSize)}`);
  const symbolSize = BI.from(`0x${hex.slice(4 + nameSize, 4 + nameSize + 2)}`).toNumber() * 2;
  const symbol = hexToUtf8(`0x${hex.slice(4 + nameSize + 2, 4 + nameSize + 2 + symbolSize)}`);
  return {
    decimal,
    name,
    symbol,
  };
}

const TESTNET_INSCRIPTION_TYPE_SCRIPT: CKBComponents.Script = {
  codeHash: '0x50fdea2d0030a8d0b3d69f883b471cab2a29cae6f01923f19cecac0f27fdaaa6',
  hashType: 'type',
  args: '',
}

const MAINNET_INSCRIPTION_TYPE_SCRIPT: CKBComponents.Script = {
  codeHash: '0x5c33fc69bd72e895a63176147c6ab0bb5758d1c7a32e0914f99f9ec1bed90d41',
  hashType: 'type',
  args: '',
}

export function getInscriptionTypeScript(isMainnet: boolean) {
  return isMainnet ? MAINNET_INSCRIPTION_TYPE_SCRIPT : TESTNET_INSCRIPTION_TYPE_SCRIPT;
}

export function isUniqueCellTypeScript(script: CKBComponents.Script, isMainnet: boolean) {
  const uniqueCellTypeScript = getUniqueTypeScript(isMainnet);
  return script.codeHash === uniqueCellTypeScript.codeHash && script.hashType === uniqueCellTypeScript.hashType;
}

export function isInscriptionTypeScript(script: CKBComponents.Script, isMainnet: boolean) {
  const inscriptionTypeScript = getInscriptionTypeScript(isMainnet);
  return script.codeHash === inscriptionTypeScript.codeHash && script.hashType === inscriptionTypeScript.hashType;
}
