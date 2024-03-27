import { beforeEach, expect, test } from 'vitest';
import { buildFastify } from '../../../src/app';
import { describe } from 'node:test';
import { Env } from '../../../src/env';

let token: string;

describe('/bitcoin/v1/paymaster', () => {
  beforeEach(async () => {
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

  test('Get paymaster btc address', async () => {
    const fastify = buildFastify();
    await fastify.ready();

    const env: Env = fastify.container.resolve('env');

    const response = await fastify.inject({
      method: 'GET',
      url: '/rgbpp/v1/paymaster/btc_address',
      headers: {
        Authorization: `Bearer ${token}`,
        Origin: 'https://test.com',
      },
    });
    const data = response.json();

    expect(response.statusCode).toBe(200);
    expect(data.btc_address).toEqual(env.PAYMASTER_RECEIVE_BTC_ADDRESS);

    await fastify.close();
  });

  test('Get paymaster container fee', async () => {
    const fastify = buildFastify();
    await fastify.ready();

    const env: Env = fastify.container.resolve('env');

    const response = await fastify.inject({
      method: 'GET',
      url: '/rgbpp/v1/paymaster/container_fee',
      headers: {
        Authorization: `Bearer ${token}`,
        Origin: 'https://test.com',
      },
    });
    const data = response.json();

    expect(response.statusCode).toBe(200);
    expect(data.fee).toEqual(env.PAYMASTER_BTC_CONTAINER_FEE_SATS);

    await fastify.close();
  });
});
