import { describe, expect, test, beforeEach, vi } from 'vitest';
import { buildFastify } from '../../../src/app';
import { afterEach } from 'node:test';
import BitcoinClient from '../../../src/services/bitcoin';

let token: string;

describe('/bitcoin/v1/address', () => {
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

  afterEach(() => {
    vi.resetAllMocks();
  });

  test('Get address balance', async () => {
    const fastify = buildFastify();
    await fastify.ready();

    const response = await fastify.inject({
      method: 'GET',
      url: '/bitcoin/v1/address/tb1qm4eyx777203zmajlawz958wn27z08envm2jelm/balance',
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

  test('Get address balance with min_satoshi param', async () => {
    const fastify = buildFastify();
    await fastify.ready();

    const response = await fastify.inject({
      method: 'GET',
      url: '/bitcoin/v1/address/tb1qm4eyx777203zmajlawz958wn27z08envm2jelm/balance?min_satoshi=10000',
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

  test('Get address balance with invalid address', async () => {
    const fastify = buildFastify();
    await fastify.ready();

    const response = await fastify.inject({
      method: 'GET',
      url: '/bitcoin/v1/address/tb1qlrg2mhyxrq7ns5rpa6qvrvttr9674n6z0try/balance',
      headers: {
        Authorization: `Bearer ${token}`,
        Origin: 'https://test.com',
      },
    });
    const data = response.json();

    expect(response.statusCode).toBe(400);
    expect(data.message).toBe('Invalid bitcoin address');

    await fastify.close();
  });

  test('Get address unspent transaction outputs', async () => {
    const fastify = buildFastify();
    await fastify.ready();

    const bitcoin: BitcoinClient = fastify.container.resolve('bitcoin');
    const originalGetAddressTxsUtxo = bitcoin.getAddressTxsUtxo;
    vi.spyOn(bitcoin, 'getAddressTxsUtxo').mockResolvedValue([
      {
        txid: '9706131c1e327a068a6aafc16dc69a46c50bc7c65f180513896bdad39a6babfc',
        vout: 0,
        status: {
          confirmed: true,
        },
        value: 100000,
      },
      {
        txid: '1706131c1e327a068a6aafc16dc69a46c50bc7c65f180513896bdad39a6babfc',
        vout: 0,
        status: {
          confirmed: false,
        },
        value: 100000,
      },
    ]);

    const response = await fastify.inject({
      method: 'GET',
      url: '/bitcoin/v1/address/tb1qm4eyx777203zmajlawz958wn27z08envm2jelm/unspent',
      headers: {
        Authorization: `Bearer ${token}`,
        Origin: 'https://test.com',
      },
    });
    const data = response.json();
    bitcoin.getAddressTxsUtxo = originalGetAddressTxsUtxo;

    expect(response.statusCode).toBe(200);
    expect(data.length).toBe(1);

    await fastify.close();
  });

  test('Get address unspent transaction outputs with unconfirmed', async () => {
    const fastify = buildFastify();
    await fastify.ready();

    const bitcoin: BitcoinClient = fastify.container.resolve('bitcoin');
    const originalGetAddressTxsUtxo = bitcoin.getAddressTxsUtxo;
    vi.spyOn(bitcoin, 'getAddressTxsUtxo').mockResolvedValue([
      {
        txid: '9706131c1e327a068a6aafc16dc69a46c50bc7c65f180513896bdad39a6babfc',
        vout: 0,
        status: {
          confirmed: true,
        },
        value: 100000,
      },
      {
        txid: '1706131c1e327a068a6aafc16dc69a46c50bc7c65f180513896bdad39a6babfc',
        vout: 0,
        status: {
          confirmed: false,
        },
        value: 100000,
      },
    ]);

    const response = await fastify.inject({
      method: 'GET',
      url: '/bitcoin/v1/address/tb1qm4eyx777203zmajlawz958wn27z08envm2jelm/unspent?only_confirmed=false',
      headers: {
        Authorization: `Bearer ${token}`,
        Origin: 'https://test.com',
      },
    });
    const data = response.json();
    bitcoin.getAddressTxsUtxo = originalGetAddressTxsUtxo;

    expect(response.statusCode).toBe(200);
    expect(data.length).toBe(2);

    await fastify.close();
  });

  test('Get address unspent transaction outputs with only_confirmed = undefined', async () => {
    const fastify = buildFastify();
    await fastify.ready();

    const bitcoin: BitcoinClient = fastify.container.resolve('bitcoin');
    const originalGetAddressTxsUtxo = bitcoin.getAddressTxsUtxo;
    vi.spyOn(bitcoin, 'getAddressTxsUtxo').mockResolvedValue([
      {
        txid: '9706131c1e327a068a6aafc16dc69a46c50bc7c65f180513896bdad39a6babfc',
        vout: 0,
        status: {
          confirmed: true,
        },
        value: 100000,
      },
      {
        txid: '1706131c1e327a068a6aafc16dc69a46c50bc7c65f180513896bdad39a6babfc',
        vout: 0,
        status: {
          confirmed: false,
        },
        value: 100000,
      },
    ]);

    const response = await fastify.inject({
      method: 'GET',
      url: '/bitcoin/v1/address/tb1qm4eyx777203zmajlawz958wn27z08envm2jelm/unspent?only_confirmed=undefined',
      headers: {
        Authorization: `Bearer ${token}`,
        Origin: 'https://test.com',
      },
    });
    const data = response.json();
    bitcoin.getAddressTxsUtxo = originalGetAddressTxsUtxo;

    expect(response.statusCode).toBe(200);
    expect(data.length).toBe(1);

    await fastify.close();
  });

  test('Get address transactions', async () => {
    const fastify = buildFastify();
    await fastify.ready();

    const response = await fastify.inject({
      method: 'GET',
      url: '/bitcoin/v1/address/tb1qm4eyx777203zmajlawz958wn27z08envm2jelm/txs',
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