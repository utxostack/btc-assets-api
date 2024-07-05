import { BTCTestnetType } from '@rgbpp-sdk/ckb';

export enum NetworkType {
  mainnet = 'mainnet',
  testnet = 'testnet',
  signet = 'signet',
}

export const TestnetTypeMap: Record<NetworkType, BTCTestnetType | undefined> = {
  [NetworkType.mainnet]: undefined,
  [NetworkType.testnet]: 'Testnet3',
  [NetworkType.signet]: 'Signet',
};

export const CUSTOM_HEADERS = {
  ApiCache: 'x-api-cache',
  ResponseCacheable: 'x-response-cacheable',
  ResponseCacheMaxAge: 'x-response-cache-max-age',
};

export enum ApiCacheStatus {
  Hit = 'HIT',
  Miss = 'MISS',
}
