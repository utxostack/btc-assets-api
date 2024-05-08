import { beforeEach, expect, test } from 'vitest';
import { buildFastify } from '../../../src/app';
import { describe } from 'node:test';

let token: string;

describe('/bitcoin/v1/transaction', () => {
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

  test('Get transaction by txid', async () => {
    const fastify = buildFastify();
    await fastify.ready();

    const response = await fastify.inject({
      method: 'GET',
      url: '/bitcoin/v1/transaction/9706131c1e327a068a6aafc16dc69a46c50bc7c65f180513896bdad39a6babfc',
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

  test('Get not exists transaction', async () => {
    const fastify = buildFastify();
    await fastify.ready();

    const response = await fastify.inject({
      method: 'GET',
      url: '/bitcoin/v1/transaction/9706131c1e327a068a6aafc16dc69a46c50bc7c65f180513896bdad39a6babf1',
      headers: {
        Authorization: `Bearer ${token}`,
        Origin: 'https://test.com',
      },
    });
    const data = await response.json();

    expect(response.statusCode).toBe(404);
    expect(data).toMatchSnapshot();

    await fastify.close();
  });

  test('Get transaction hex', async () => {
    const fastify = buildFastify();
    await fastify.ready();

    const response = await fastify.inject({
      method: 'GET',
      url: '/bitcoin/v1/transaction/9706131c1e327a068a6aafc16dc69a46c50bc7c65f180513896bdad39a6babfc/hex',
      headers: {
        Authorization: `Bearer ${token}`,
        Origin: 'https://test.com',
      },
    });
    const data = await response.json();

    expect(response.statusCode).toBe(200);
    expect(data).toEqual({
      hex: '020000000001013115e849359a46737e7bf3e121a5a5de666a1ad01933e3df7dc48f97199f18d00000000000ffffffff02e803000000000000160014dd72437bde53e22df65feb845a1dd35784f3e66cacc1020000000000160014f8d0addc86183d385061ee80c1b16b1975eacf4202483045022100f50e2e6ee5ea04e4f7029d29a28e80266969f91357055e1d53b0715b768c448102204ccd9dbb38d0cc007e07b9c8b4088d4fac4ab65fef49774bafe27acbfc3d1111012102d05848540f152d730e272bc9628dd4e4a5f4126fdf118ad6a4fd6afd26b0831300000000',
    });

    await fastify.close();
  });

  test('Send exists raw transaction', async () => {
    const fastify = buildFastify();
    await fastify.ready();

    const response = await fastify.inject({
      method: 'POST',
      url: '/bitcoin/v1/transaction',
      headers: {
        Authorization: `Bearer ${token}`,
        Origin: 'https://test.com',
      },
      body: {
        txhex:
          '02000000000101fe7b9cd0f75741e2ec1e3a6142eab945e64fab0ef15de4a66c635c0a789e986f0100000000ffffffff02e803000000000000160014dbf4360c0791098b0b14679e5e78015df3f2caad6a88000000000000160014dbf4360c0791098b0b14679e5e78015df3f2caad02473044022065829878f51581488f44c37064b46f552ea7354196fae5536906797b76b370bf02201c459081578dc4e1098fbe3ab68d7d56a99e8e9810bf2806d10053d6b36ffa4d0121037dff8ff2e0bd222690d785f9277e0c4800fc88b0fad522f1442f21a8226253ce00000000',
      },
    });

    expect(response.statusCode).toBe(400);
    await fastify.close();
  });
});
