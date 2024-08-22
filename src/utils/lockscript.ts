import { getBtcTimeLockScript, getRgbppLockScript } from '@rgbpp-sdk/ckb';
import { IS_MAINNET, TESTNET_TYPE } from '../constants';

export function getRgbppLock(): CKBComponents.Script {
  return getRgbppLockScript(IS_MAINNET, TESTNET_TYPE);
}

export function getBtcTimeLock(): CKBComponents.Script {
  return getBtcTimeLockScript(IS_MAINNET, TESTNET_TYPE);
}

export function isRgbppLock(script: CKBComponents.Script): boolean {
  const rgbppLock = getRgbppLock();
  return script.codeHash === rgbppLock.codeHash && script.hashType === rgbppLock.hashType;
}

export function isBtcTimeLock(script: CKBComponents.Script): boolean {
  const btcTimeLock = getBtcTimeLock();
  return script.codeHash === btcTimeLock.codeHash && script.hashType === btcTimeLock.hashType;
}
