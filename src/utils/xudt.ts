import { BI } from '@ckb-lumos/lumos';
import { remove0x } from '@rgbpp-sdk/btc';
import { getUniqueTypeScript } from '@rgbpp-sdk/ckb';

export function decodeUDTHashFromInscriptionData(data: string) {
  try {
    const hex = remove0x(data);
    const nameSize = BI.from(`0x${hex.slice(2, 4)}`).toNumber() * 2;
    const symbolSize = BI.from(`0x${hex.slice(4 + nameSize, 4 + nameSize + 2)}`).toNumber() * 2;
    const udtHashStart = 4 + nameSize + 2 + symbolSize;
    return `0x${hex.slice(udtHashStart, udtHashStart + 64)}`;
  } catch (e) {
    return null;
  }
}

export function getInscriptionInfoTypeScript(isMainnet: boolean) {
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
  return isMainnet ? MAINNET_INSCRIPTION_INFO_TYPE_SCRIPT : TESTNET_INSCRIPTION_INFO_TYPE_SCRIPT;
}

export function getInscriptionTypeScript(isMainnet: boolean) {
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
  return isMainnet ? MAINNET_INSCRIPTION_TYPE_SCRIPT : TESTNET_INSCRIPTION_TYPE_SCRIPT;
}

export function getInscriptionRebaseTypeScript(isMainnet: boolean) {
  const TEST_INSCRIPTION_REBASE_TYPE_SCRIPT: CKBComponents.Script = {
    codeHash: '0x93043b66bb20797caad0deacaadbada5e58f0893d770ecdddb8806aff8877e29',
    hashType: 'type',
    args: '',
  };
  const MAIN_INSCRIPTION_REBASE_TYPE_SCRIPT: CKBComponents.Script = {
    codeHash: '0xda8fbf9b8497c0a34fad89377026e51128817c60167a2b7673b27c1a3f2a331f',
    hashType: 'type',
    args: '',
  };
  return isMainnet ? MAIN_INSCRIPTION_REBASE_TYPE_SCRIPT : TEST_INSCRIPTION_REBASE_TYPE_SCRIPT;
}

export function isUniqueCellTypeScript(script: CKBComponents.Script, isMainnet: boolean) {
  const uniqueCellTypeScript = getUniqueTypeScript(isMainnet);
  return script.codeHash === uniqueCellTypeScript.codeHash && script.hashType === uniqueCellTypeScript.hashType;
}

export function isInscriptionInfoTypeScript(script: CKBComponents.Script, isMainnet: boolean) {
  const inscriptionTypeScript = getInscriptionInfoTypeScript(isMainnet);
  return script.codeHash === inscriptionTypeScript.codeHash && script.hashType === inscriptionTypeScript.hashType;
}

export function isInscriptionRebaseTypeScript(script: CKBComponents.Script, isMainnet: boolean) {
  const inscriptionRebaseTypeScript = getInscriptionRebaseTypeScript(isMainnet);
  return (
    script.codeHash === inscriptionRebaseTypeScript.codeHash && script.hashType === inscriptionRebaseTypeScript.hashType
  );
}
