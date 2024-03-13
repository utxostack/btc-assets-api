import { afterEach, beforeEach, vi } from 'vitest';
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-expect-error
import RedisServer from 'redis-server';

const MOCK_SERVER_PORT = 6379;
let server: RedisServer;

beforeEach(async () => {
  server = new RedisServer();
  await server.open({ port: MOCK_SERVER_PORT });
  vi.stubEnv('REDIS_URL', `redis://localhost:${MOCK_SERVER_PORT}`);
});

afterEach(async () => {
  await server.close();
});
