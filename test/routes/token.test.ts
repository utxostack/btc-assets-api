import { expect, test } from 'vitest';
import { buildFastify } from '../../src/app';

test('`/token/generate` - 400', async () => {
  const fastify = buildFastify();
  await fastify.ready();

  const response = await fastify.inject({
    method: 'POST',
    url: '/token/generate',
  });
  const data = response.json();

  expect(response.statusCode).toBe(400);
  expect(data.message).toBe('body must be object');

  await fastify.close();
});

test('`/token/generate` - 200', async () => {
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

  expect(response.statusCode).toBe(200);
  expect(data.token).toBeDefined();

  await fastify.close();
});
