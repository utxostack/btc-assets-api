import { beforeAll, expect, test } from 'vitest';
import { buildFastify } from '../../../src/app';
import { describe } from 'node:test';

let token: string;

describe('/bitcoin/v1/block', () => {
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

  test('Get block by hash', async () => {
    const fastify = buildFastify();
    await fastify.ready();

    const response = await fastify.inject({
      method: 'GET',
      url: '/bitcoin/v1/block/0000000000000005ae0b929ee3afbf2956aaa0059f9d7608dc396cf5f8f4dda6',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    const data = response.json();

    expect(response.statusCode).toBe(200);
    expect(data).toMatchSnapshot();

    await fastify.close();
  });

  test('Get block header by hash', async () => {
    const fastify = buildFastify();
    await fastify.ready();

    const response = await fastify.inject({
      method: 'GET',
      url: '/bitcoin/v1/block/0000000000000005ae0b929ee3afbf2956aaa0059f9d7608dc396cf5f8f4dda6/header',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    const data = response.json();

    expect(response.statusCode).toBe(200);
    expect(data).toMatchSnapshot();

    await fastify.close();
  });

  test('Get block hash by height', async () => {
    const fastify = buildFastify();
    await fastify.ready();

    const response = await fastify.inject({
      method: 'GET',
      url: '/bitcoin/v1/block/height/0',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    const data = response.json();

    expect(response.statusCode).toBe(200);
    expect(data).toMatchSnapshot();

    await fastify.close();
  });
});
