export enum NetworkType {
  mainnet = 'prod',
  testnet = 'testnet',
}

export const CUSTOM_HEADERS = {
  ApiCache: 'x-api-cache',
  ResponseCacheable: 'x-response-cacheable',
};

export enum ApiCacheStatus {
  Hit = 'HIT',
  Miss = 'MISS',
}

export const JWT_IGNORE_URLS = ['/token', '/docs', '/cron'];
export const SWAGGER_PROD_IGNORE_URLS = ['/token', '/cron'];
