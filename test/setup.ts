import { afterAll, vi } from 'vitest';
import container from '../src/container';

if (process.env.CI_REDIS_URL) {
  vi.stubEnv('REDIS_URL', process.env.CI_REDIS_URL);
}

afterAll(async () => {
  container.cradle.redis.flushall();
});
