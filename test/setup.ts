import { afterEach, beforeEach, vi } from 'vitest';
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-expect-error
import RedisServer from 'redis-server';

const MOCK_SERVER_PORT = 6666;
let server: RedisServer;

vi.stubEnv('REDIS_URL', `redis://localhost:${MOCK_SERVER_PORT}`);

beforeEach(async () => {
  server = new RedisServer(MOCK_SERVER_PORT);
  await server.open();
});

afterEach(async () => {
  await server.close();
});
