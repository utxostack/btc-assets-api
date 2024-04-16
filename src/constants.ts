import { isAdminMode } from './env';

export enum NetworkType {
  mainnet = 'prod',
  testnet = 'testnet',
}

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
