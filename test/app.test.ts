import { expect, test } from 'vitest';
import { buildFastify } from '../src/app';

test('`/docs/json` - 200', async () => {
  const fastify = buildFastify();
  await fastify.ready();

  const response = await fastify.inject({
    method: 'GET',
    url: '/docs/json',
  });
  const data = response.json();

  expect(response.statusCode).toBe(200);
  expect(data.swagger).toBe('2.0');
  expect(Object.keys(data.paths)).toStrictEqual([
    '/token/generate',
    '/bitcoin/v1/info',
    '/bitcoin/v1/block/{hash}',
    '/bitcoin/v1/block/{hash}/header',
    '/bitcoin/v1/block/height/{height}',
    '/bitcoin/v1/transaction',
    '/bitcoin/v1/transaction/{txid}',
    '/bitcoin/v1/address/{address}/balance',
    '/bitcoin/v1/address/{address}/unspent',
    '/bitcoin/v1/address/{address}/txs',
  ]);

  await fastify.close();
});