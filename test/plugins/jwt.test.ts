import { beforeAll, afterEach, describe, test, expect } from 'vitest';
import { buildFastify } from '../../src/app';
import container from '../../src/container';
import { JwtPayload } from '../../src/plugins/jwt';

describe('JWT Plugin', () => {
  let token: string;
  let decodedToken: JwtPayload;

  beforeAll(async () => {
    const fastify = buildFastify();
    await fastify.ready();

    const payload = {
      sub: 'test',
      aud: 'test.com',
    };
    const tokenResponse = await fastify.inject({
      method: 'POST',
      url: '/token/generate',
      payload: {
        app: payload.sub,
        domain: payload.aud,
      },
    });
    const data = tokenResponse.json();
    token = data.token;
    decodedToken = { ...payload, jti: data.id };
  });

  afterEach(() => {
    const env = container.resolve('env');
    env.JWT_DENYLIST = [];
  });

  test('should fastify.jwt be defined', async () => {
    const fastify = buildFastify();
    await fastify.ready();

    expect(fastify.hasDecorator('jwt')).toBeDefined();

    await fastify.close();
  });

  test('should be return 401 if token is not provided', async () => {
    const fastify = buildFastify();
    await fastify.ready();

    const response = await fastify.inject({
      method: 'GET',
      url: '/bitcoin/v1/info',
    });

    expect(response.statusCode).toBe(401);

    await fastify.close();
  });

  test('should be return 401 if token origin/referer is not match', async () => {
    const fastify = buildFastify();
    await fastify.ready();

    const response = await fastify.inject({
      method: 'GET',
      url: '/bitcoin/v1/info',
      headers: {
        Authorization: `Bearer ${token}`,
        Origin: 'https://example.com',
      },
    });

    expect(response.statusCode).toBe(401);

    await fastify.close();
  });

  test('should be return 401 if token is denied', async () => {
    const env = container.resolve('env');
    env.JWT_DENYLIST = [token];

    const fastify = buildFastify();
    await fastify.ready();

    const response = await fastify.inject({
      method: 'GET',
      url: '/bitcoin/v1/info',
      headers: {
        Authorization: `Bearer ${token}`,
        Origin: 'https://test.com',
      },
    });

    expect(response.statusCode).toBe(401);
    await fastify.close();
  });

  test.each<keyof JwtPayload>(['sub', 'aud', 'jti'])('should be return 401 if token.%s is denied', async (key) => {
    const env = container.resolve('env');
    env.JWT_DENYLIST = [decodedToken[key]];

    const fastify = buildFastify();
    await fastify.ready();

    const response = await fastify.inject({
      method: 'GET',
      url: '/bitcoin/v1/info',
      headers: {
        Authorization: `Bearer ${token}`,
        Origin: 'https://test.com',
      },
    });

    expect(response.statusCode).toBe(401);
    await fastify.close();
  });
});
