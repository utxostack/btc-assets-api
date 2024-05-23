import { BI } from '@ckb-lumos/lumos';
import { scriptToHash } from '@nervosnetwork/ckb-sdk-utils';
import { remove0x } from '@rgbpp-sdk/btc';
import { append0x, getUniqueTypeScript, hexToUtf8 } from '@rgbpp-sdk/ckb';

// https://github.com/ckb-cell/unique-cell?tab=readme-ov-file#xudt-information
export function decodeInfoCellData(data: string) {
  const hex = remove0x(data);
  const info = {
    decimal: BI.from(`0x${hex.slice(0, 2)}`).toNumber(),
    name: '',
    symbol: '',
  };

  const nameSize = BI.from(`0x${hex.slice(2, 4)}`).toNumber() * 2;
  if (nameSize > 0) {
    info.name = hexToUtf8(`0x${hex.slice(4, 4 + nameSize)}`);
  }

  const symbolSize = BI.from(`0x${hex.slice(4 + nameSize, 4 + nameSize + 2)}`).toNumber() * 2;
  if (symbolSize > 0) {
    info.symbol = hexToUtf8(`0x${hex.slice(4 + nameSize + 2, 4 + nameSize + 2 + symbolSize)}`);
  }
  return info;
}

const TESTNET_INSCRIPTION_INFO_TYPE_SCRIPT: CKBComponents.Script = {
  codeHash: '0x50fdea2d0030a8d0b3d69f883b471cab2a29cae6f01923f19cecac0f27fdaaa6',
  hashType: 'type',
  args: '',
};

const MAINNET_INSCRIPTION_INFO_TYPE_SCRIPT: CKBComponents.Script = {
  codeHash: '0x5c33fc69bd72e895a63176147c6ab0bb5758d1c7a32e0914f99f9ec1bed90d41',
  hashType: 'type',
  args: '',
};

export function getInscriptionInfoTypeScript(isMainnet: boolean) {
  return isMainnet ? MAINNET_INSCRIPTION_INFO_TYPE_SCRIPT : TESTNET_INSCRIPTION_INFO_TYPE_SCRIPT;
}

const TESTNET_INSCRIPTION_TYPE_SCRIPT: CKBComponents.Script = {
  codeHash: '0x3a241ceceede72a5f55c8fb985652690f09a517d6c9070f0df0d3572fa03fb70',
  hashType: 'type',
  args: '',
};

const MAINNET_INSCRIPTION_TYPE_SCRIPT: CKBComponents.Script = {
  codeHash: '0x7490970e6af9b9fe63fc19fc523a12b2ec69027e6ae484edffb97334f74e8c97',
  hashType: 'type',
  args: '',
};

export function getInscriptionTypeScript(isMainnet: boolean) {
  return isMainnet ? MAINNET_INSCRIPTION_TYPE_SCRIPT : TESTNET_INSCRIPTION_TYPE_SCRIPT;
}

export function isUniqueCellTypeScript(script: CKBComponents.Script, isMainnet: boolean) {
  const uniqueCellTypeScript = getUniqueTypeScript(isMainnet);
  return script.codeHash === uniqueCellTypeScript.codeHash && script.hashType === uniqueCellTypeScript.hashType;
}

export function isInscriptionInfoTypeScript(script: CKBComponents.Script, isMainnet: boolean) {
  const inscriptionTypeScript = getInscriptionInfoTypeScript(isMainnet);
  return script.codeHash === inscriptionTypeScript.codeHash && script.hashType === inscriptionTypeScript.hashType;
}

export const getXUDTTypeScriptArgs = (infoTypeScript: CKBComponents.Script, isMainnet: boolean) => {
  const script = {
    ...getInscriptionTypeScript(isMainnet),
    args: append0x(scriptToHash(infoTypeScript)),
  } as CKBComponents.Script;
  return append0x(scriptToHash(script));
};
