import { isAdminMode } from './env';
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

export const JWT_IGNORE_URLS = ['/token', '/docs', '/cron', '/internal', '/healthcheck'];
export const SWAGGER_PROD_IGNORE_URLS = isAdminMode ? ['/token', '/cron'] : ['/cron'];

export const VERCEL_MAX_DURATION = 300;

// estimate time: 2024-04-03 09:45:17
// ref: https://mempool.space/testnet/block/000000000000000493ba5eebf0602f3e0e5381dd35f763a62ca7ea135343a0d6
export const BTC_TESTNET_SPV_START_BLOCK_HEIGHT = 2584900;

// estimate time: 2024-04-02 06:20:03
// ref: https://mempool.space/block/0000000000000000000077d98a103858c7d7cbc5ba67a4135f348a436bec1748
export const BTC_MAINNET_SPV_START_BLOCK_HEIGHT = 837300;
