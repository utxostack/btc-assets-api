import { expect, test } from 'vitest';
import { buildFastify } from '../../src/app';

test('`/token/generate` - successfuly', async () => {
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

test('`/token/generate` - without params', async () => {
  const fastify = buildFastify();
  await fastify.ready();

  const response = await fastify.inject({
    method: 'POST',
    url: '/token/generate',
  });
  const data = response.json();

  expect(response.statusCode).toBe(400);
  expect(data.message).toMatchSnapshot();

  await fastify.close();
});

test('`/token/generate` - invalid domain', async () => {
  const fastify = buildFastify();
  await fastify.ready();

  const response = await fastify.inject({
    method: 'POST',
    url: '/token/generate',
    payload: {
      app: 'test',
      domain: '\\',
    },
  });
  const data = response.json();

  expect(response.statusCode).toBe(500);
  expect(data.message).toEqual('Failed to generate token: Invalid URL');

  await fastify.close();
});

test('`/token/generate` - with pathname', async () => {
  const fastify = buildFastify();
  await fastify.ready();

  const response = await fastify.inject({
    method: 'POST',
    url: '/token/generate',
    payload: {
      app: 'test',
      domain: 'http://test.com/abc',
    },
  });
  const data = response.json();

  expect(response.statusCode).toBe(500);
  expect(data.message).toEqual('Failed to generate token: Must be a valid domain without path');

  await fastify.close();
});

test('`/token/generate` - with protocol', async () => {
  const fastify = buildFastify();
  await fastify.ready();

  const response = await fastify.inject({
    method: 'POST',
    url: '/token/generate',
    payload: {
      app: 'test',
      domain: 'https://test.com',
    },
  });
  const data = response.json();

  expect(response.statusCode).toBe(200);
  expect(data.token).toBeDefined();

  await fastify.close();
});

test('`/token/generate` - with port', async () => {
  const fastify = buildFastify();
  await fastify.ready();

  const response = await fastify.inject({
    method: 'POST',
    url: '/token/generate',
    payload: {
      app: 'test',
      domain: 'test.com:3000',
    },
  });
  const data = response.json();

  expect(response.statusCode).toBe(200);
  expect(data.token).toBeDefined();

  await fastify.close();
});
