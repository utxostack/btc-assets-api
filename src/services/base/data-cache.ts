import { Redis } from 'ioredis';
import { z } from 'zod';

interface IDataCacheOptions<T> {
  prefix: string;
  schema: z.ZodType<T>;
  expire: number;
}

class DataCacheError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DataCacheError';
  }
}

export default class DataCache<T> {
  private redis: Redis;
  private prefix: string;
  private schema: z.ZodType<T>;
  private expire: number;

  constructor(redis: Redis, options: IDataCacheOptions<T>) {
    this.redis = redis;
    this.prefix = options.prefix;
    this.schema = options.schema;
    this.expire = options.expire;
  }

  public async set(btcAddress: string, data: unknown) {
    const parsed = this.schema.safeParse(data);
    if (!parsed.success) {
      throw new DataCacheError(parsed.error.message);
    }
    const key = `data-cache:${this.prefix}:${btcAddress}`;
    await this.redis.set(key, JSON.stringify(parsed.data), 'PX', this.expire);
    return parsed.data;
  }

  public async get(btcAddress: string): Promise<T | null> {
    const key = `data-cache:${this.prefix}:${btcAddress}`;
    const data = await this.redis.get(key);
    if (data) {
      const parsed = this.schema.safeParse(JSON.parse(data));
      if (parsed.success) {
        return parsed.data;
      }
    }
    return null;
  }
}
