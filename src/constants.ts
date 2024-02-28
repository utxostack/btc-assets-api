export const CUSTOM_HEADERS = {
  ApiCache: 'x-api-cache',
  ResponseCacheable: 'x-response-cacheable',
};

export enum ApiCacheStatus {
  Hit = 'HIT',
  Miss = 'MISS',
}
