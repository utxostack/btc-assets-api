import { beforeEach, expect, test } from 'vitest';
import { buildFastify } from '../../../src/app';
import { describe } from 'node:test';

let token: string;

describe('/rgbpp/v1/assets', () => {
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

  test('Get RGB++ assets by BTC txid', async () => {
    const fastify = buildFastify();
    await fastify.ready();

    const response = await fastify.inject({
      method: 'GET',
      url: '/rgbpp/v1/assets/ca159e04767c25cb012f0d1c0731c767e2b58468d4cd7b505de0b184dcf97017',
      headers: {
        Authorization: `Bearer ${token}`,
        Origin: 'https://test.com',
      },
    });
    const data = response.json();

    expect(response.statusCode).toBe(200);
    expect(data).toMatchSnapshot();

    await fastify.close();
  });

  test('Get RGB++ assets by BTC txid and vout', async () => {
    const fastify = buildFastify();
    await fastify.ready();

    const response = await fastify.inject({
      method: 'GET',
      url: '/rgbpp/v1/assets/ca159e04767c25cb012f0d1c0731c767e2b58468d4cd7b505de0b184dcf97017/1',
      headers: {
        Authorization: `Bearer ${token}`,
        Origin: 'https://test.com',
      },
    });
    const data = response.json();

    expect(response.statusCode).toBe(200);
    expect(data).toMatchSnapshot();

    await fastify.close();
  });
});
