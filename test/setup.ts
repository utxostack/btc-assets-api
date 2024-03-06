import { vi } from 'vitest';
import Redis from 'ioredis-mock';

vi.stubEnv('REDIS_URL', '');

vi.mock('ioredis', () => ({
  Redis,
}));
