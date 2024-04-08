import { afterEach } from 'node:test';
import { describe, expect, test } from 'vitest';
import container from '../../src/container';
import { Env } from '../../src/env';
import { buildFastify } from '../../src/app';

describe('IP Blocklist Plugin', () => {
  afterEach(() => {
    const env: Env = container.resolve('env');
    env.IP_BLOCKLIST = [];
  });

  test('should block IP if it is in the blocklist', async () => {
    const env: Env = container.resolve('env');
    env.IP_BLOCKLIST = ['127.0.0.1'];

    const fastify = buildFastify();
    await fastify.ready();

    const response = await fastify.inject({
      method: 'GET',
      url: '/docs',
    });

    expect(response.statusCode).toBe(403);

    await fastify.close();
  });

  test('should not block IP if it is not in the blocklist', async () => {
    const env: Env = container.resolve('env');
    env.IP_BLOCKLIST = [];

    const fastify = buildFastify();
    await fastify.ready();

    const response = await fastify.inject({
      method: 'GET',
      url: '/docs',
    });

    expect(response.statusCode).not.toBe(403);

    await fastify.close();
  });
});
