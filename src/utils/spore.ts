import { unpackToRawSporeData, unpackToRawClusterData, predefinedSporeConfigs } from '@spore-sdk/core';

export { unpackToRawSporeData, unpackToRawClusterData };

export function getSporeConfig(isMainnet: boolean) {
  const config = predefinedSporeConfigs[isMainnet ? 'Mainnet' : 'Testnet'];
  return config;
}
