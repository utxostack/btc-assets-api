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

test('`/transaction/:txid` - 200', async () => {
  const fastify = buildFastify();
  await fastify.ready();

  const response = await fastify.inject({
    method: 'GET',
    url: '/bitcoin/v1/transaction/9706131c1e327a068a6aafc16dc69a46c50bc7c65f180513896bdad39a6babfc',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  const data = response.json();

  expect(response.statusCode).toBe(200);
  expect(data).toMatchSnapshot();

  await fastify.close();
});
