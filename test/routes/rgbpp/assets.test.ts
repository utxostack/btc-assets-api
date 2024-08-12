import { beforeEach, expect, test } from 'vitest';
import { buildFastify } from '../../../src/app';
import { describe } from 'node:test';
import { blockchain } from '@ckb-lumos/base';
import { hexify } from '@ckb-lumos/codec/lib/bytes';

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

  test('Get RGB++ assets type info (xUDT)', async () => {
    const fastify = buildFastify();
    await fastify.ready();

    const typeScript = blockchain.Script.pack({
      codeHash: '0x25c29dc317811a6f6f3985a7a9ebc4838bd388d19d0feeecf0bcd60f6c0975bb',
      hashType: 'type',
      args: '0x8c556e92974a8dd8237719020a259d606359ac2cc958cb8bda77a1c3bb3cd93b',
    });
    const response = await fastify.inject({
      method: 'GET',
      url: '/rgbpp/v1/assets/type?type_script=' + hexify(typeScript),
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

  test('Get RGB++ assets type info (Spore)', async () => {
    const fastify = buildFastify();
    await fastify.ready();

    const typeScript = blockchain.Script.pack({
      codeHash: '0x685a60219309029d01310311dba953d67029170ca4848a4ff638e57002130a0d',
      hashType: 'data1',
      args: '0xc966bd9131e7f23629a022b1310adfb3c5c98c1ac0c0ce11871685b4c8199959',
    });
    const response = await fastify.inject({
      method: 'GET',
      url: '/rgbpp/v1/assets/type?type_script=' + hexify(typeScript),
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
