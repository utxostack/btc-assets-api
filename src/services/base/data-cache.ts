import { Redis } from 'ioredis';
import { z } from 'zod';

interface IDataCacheOptions<T> {
  prefix: string;
  expire: number;
  schema?: z.ZodType<T>;
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
    this.schema = options.schema ?? z.any();
    this.expire = options.expire;
  }

  public async set(id: string, data: unknown) {
    const parsed = this.schema.safeParse(data);
    if (!parsed.success) {
      throw new DataCacheError(parsed.error.message);
    }
    const key = `data-cache:${this.prefix}:${id}`;
    await this.redis.set(key, JSON.stringify(parsed.data), 'PX', this.expire);
    return parsed.data;
  }

  public async get(id: string): Promise<T | null> {
    const key = `data-cache:${this.prefix}:${id}`;
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
