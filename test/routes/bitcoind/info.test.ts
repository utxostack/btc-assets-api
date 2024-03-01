import { beforeAll, expect, test } from 'vitest';
import { buildFastify } from '../../../src/app';

let token: string;

beforeAll(async () => {
  const fastify = buildFastify();
  await fastify.ready();

  const response = await fastify.inject({
    method: 'POST',
    url: '/token/generate',
    payload: {
      app: 'test',
      domain: 'test.com',
    },
  });
  const data = response.json();
  token = data.token;

  await fastify.close();
});

test('`/info` - 200', async () => {
  const fastify = buildFastify();
  await fastify.ready();

  const response = await fastify.inject({
    method: 'GET',
    url: '/bitcoin/v1/info',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  const data = response.json();

  expect(response.statusCode).toBe(200);
  expect(data).toHaveProperty('bestblockhash');
  expect(data).toHaveProperty('blocks');
  expect(data).toHaveProperty('chain');
  expect(data).toHaveProperty('difficulty');
  expect(data).toHaveProperty('headers');
  expect(data).toHaveProperty('mediantime');

  await fastify.close();
});
