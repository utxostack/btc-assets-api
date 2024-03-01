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

test('`/address/:address/balance` - 200', async () => {
  const fastify = buildFastify();
  await fastify.ready();

  const response = await fastify.inject({
    method: 'GET',
    url: '/bitcoin/v1/address/tb1qlrg2mhyxrq7ns5rpa6qvrvttr9674n6z0trymp/balance',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  const data = response.json();

  expect(response.statusCode).toBe(200);
  expect(data).toStrictEqual({
    address: 'tb1qlrg2mhyxrq7ns5rpa6qvrvttr9674n6z0trymp',
    satoshi: 181652,
    pending_satoshi: 0,
    utxo_count: 2,
  });

  await fastify.close();
});

test('`/address/:address/balance` - 400', async () => {
  const fastify = buildFastify();
  await fastify.ready();

  const response = await fastify.inject({
    method: 'GET',
    url: '/bitcoin/v1/address/tb1qlrg2mhyxrq7ns5rpa6qvrvttr9674n6z0try/balance',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  const data = response.json();

  expect(response.statusCode).toBe(400);
  expect(data.message).toBe('Invalid bitcoin address');

  await fastify.close();
});

test('`/address/:address/unspent` - 200', async () => {
  const fastify = buildFastify();
  await fastify.ready();

  const response = await fastify.inject({
    method: 'GET',
    url: '/bitcoin/v1/address/tb1qlrg2mhyxrq7ns5rpa6qvrvttr9674n6z0trymp/unspent',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  const data = response.json();
  const txids = data.map((tx: { txid: string }) => tx.txid).sort();

  expect(response.statusCode).toBe(200);
  expect(txids).toEqual(
    [
      '85fdce5f5d7fd3ff73ce70e3e0a786f50cc1124830cc07341738d76fa7c3a6a9',
      '9706131c1e327a068a6aafc16dc69a46c50bc7c65f180513896bdad39a6babfc',
    ].sort(),
  );

  await fastify.close();
});

test('`/address/:address/txs` - 200', async () => {
  const fastify = buildFastify();
  await fastify.ready();

  const response = await fastify.inject({
    method: 'GET',
    url: '/bitcoin/v1/address/tb1qlrg2mhyxrq7ns5rpa6qvrvttr9674n6z0trymp/txs',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  const data = response.json();

  expect(response.statusCode).toBe(200);
  expect(data).toMatchSnapshot();

  await fastify.close();
});
