import { describe, expect, test, beforeEach, vi } from 'vitest';
import { buildFastify } from '../../../src/app';
import { afterEach } from 'node:test';
import mockUTXOs from '../../__fixtures__/utxo.mock.json';
import mockRgbppUtxoPairs from '../../__fixtures__/rgbpp-utxo-pairs.mock.json';
import { RgbppUtxoCellsPair } from '../../../src/services/rgbpp';

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
    vi.clearAllMocks();
  });

  test('Get address balance', async () => {
    const fastify = buildFastify();
    await fastify.ready();

    const utxoSyncer = fastify.container.resolve('utxoSyncer');
    vi.spyOn(utxoSyncer, 'getUtxosByAddress').mockResolvedValueOnce(mockUTXOs);
    const rgbppCollector = fastify.container.resolve('rgbppCollector');
    vi.spyOn(rgbppCollector, 'getRgbppUtxoCellsPairs').mockResolvedValueOnce(
      mockRgbppUtxoPairs as RgbppUtxoCellsPair[],
    );

    const response = await fastify.inject({
      method: 'GET',
      url: '/bitcoin/v1/address/tb1pusqtndhyt8mcrggngd0lmah4xshc0aa8vpfsttvtzxd0hxhkrwns7977yu/balance',
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

    const utxoSyncer = fastify.container.resolve('utxoSyncer');
    vi.spyOn(utxoSyncer, 'getUtxosByAddress').mockResolvedValueOnce(mockUTXOs);
    const rgbppCollector = fastify.container.resolve('rgbppCollector');
    vi.spyOn(rgbppCollector, 'getRgbppUtxoCellsPairs').mockResolvedValueOnce(
      mockRgbppUtxoPairs as RgbppUtxoCellsPair[],
    );

    const response = await fastify.inject({
      method: 'GET',
      url: '/bitcoin/v1/address/tb1pusqtndhyt8mcrggngd0lmah4xshc0aa8vpfsttvtzxd0hxhkrwns7977yu/balance?min_satoshi=10000',
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

    const utxoSyncer = fastify.container.resolve('utxoSyncer');
    vi.spyOn(utxoSyncer, 'getUtxosByAddress').mockResolvedValueOnce(mockUTXOs);
    const rgbppCollector = fastify.container.resolve('rgbppCollector');
    vi.spyOn(rgbppCollector, 'getRgbppUtxoCellsPairs').mockResolvedValueOnce(
      mockRgbppUtxoPairs as RgbppUtxoCellsPair[],
    );

    const response = await fastify.inject({
      method: 'GET',
      url: '/bitcoin/v1/address/tb1pusqtndhyt8mcrggngd0lmah4xshc0aa8vpfsttvtzxd0hxhkrwns7977yu/unspent',
      headers: {
        Authorization: `Bearer ${token}`,
        Origin: 'https://test.com',
      },
    });
    const data = response.json();

    expect(response.statusCode).toBe(200);
    expect(data).toMatchObject(mockUTXOs.filter((utxo) => utxo.status.confirmed));

    await fastify.close();
  });

  test('Get address unspent transaction outputs with only_confirmed = true', async () => {
    const fastify = buildFastify();
    await fastify.ready();

    const utxoSyncer = fastify.container.resolve('utxoSyncer');
    vi.spyOn(utxoSyncer, 'getUtxosByAddress').mockResolvedValueOnce(mockUTXOs);
    const rgbppCollector = fastify.container.resolve('rgbppCollector');
    vi.spyOn(rgbppCollector, 'getRgbppUtxoCellsPairs').mockResolvedValueOnce(
      mockRgbppUtxoPairs as RgbppUtxoCellsPair[],
    );

    const response = await fastify.inject({
      method: 'GET',
      url: '/bitcoin/v1/address/tb1pusqtndhyt8mcrggngd0lmah4xshc0aa8vpfsttvtzxd0hxhkrwns7977yu/unspent?only_confirmed=true',
      headers: {
        Authorization: `Bearer ${token}`,
        Origin: 'https://test.com',
      },
    });
    const data = response.json();

    expect(response.statusCode).toBe(200);
    expect(data).toMatchObject(mockUTXOs.filter((utxo) => utxo.status.confirmed));

    await fastify.close();
  });

  test('Get address unspent transaction outputs with only_confirmed = false', async () => {
    const fastify = buildFastify();
    await fastify.ready();

    const utxoSyncer = fastify.container.resolve('utxoSyncer');
    vi.spyOn(utxoSyncer, 'getUtxosByAddress').mockResolvedValueOnce(mockUTXOs);
    const rgbppCollector = fastify.container.resolve('rgbppCollector');
    vi.spyOn(rgbppCollector, 'getRgbppUtxoCellsPairs').mockResolvedValueOnce(
      mockRgbppUtxoPairs as RgbppUtxoCellsPair[],
    );

    const response = await fastify.inject({
      method: 'GET',
      url: '/bitcoin/v1/address/tb1pusqtndhyt8mcrggngd0lmah4xshc0aa8vpfsttvtzxd0hxhkrwns7977yu/unspent?only_confirmed=false',
      headers: {
        Authorization: `Bearer ${token}`,
        Origin: 'https://test.com',
      },
    });
    const data = response.json();

    expect(response.statusCode).toBe(200);
    expect(data).toMatchObject(mockUTXOs);

    await fastify.close();
  });

  test('Get address unspent transaction outputs with min_satoshi = 10000', async () => {
    const fastify = buildFastify();
    await fastify.ready();

    const utxoSyncer = fastify.container.resolve('utxoSyncer');
    vi.spyOn(utxoSyncer, 'getUtxosByAddress').mockResolvedValueOnce(mockUTXOs);
    const rgbppCollector = fastify.container.resolve('rgbppCollector');
    vi.spyOn(rgbppCollector, 'getRgbppUtxoCellsPairs').mockResolvedValueOnce(
      mockRgbppUtxoPairs as RgbppUtxoCellsPair[],
    );

    const response = await fastify.inject({
      method: 'GET',
      url: '/bitcoin/v1/address/tb1pusqtndhyt8mcrggngd0lmah4xshc0aa8vpfsttvtzxd0hxhkrwns7977yu/unspent?min_satoshi=10000',
      headers: {
        Authorization: `Bearer ${token}`,
        Origin: 'https://test.com',
      },
    });
    const data = response.json();

    expect(response.statusCode).toBe(200);
    expect(data).toMatchObject(mockUTXOs.filter((utxo) => utxo.value >= 10000));

    await fastify.close();
  });

  test('Get address unspent transaction outputs with onlyNonRgbppUtxos = true', async () => {
    const fastify = buildFastify();
    await fastify.ready();

    const utxoSyncer = fastify.container.resolve('utxoSyncer');
    vi.spyOn(utxoSyncer, 'getUtxosByAddress').mockResolvedValueOnce(mockUTXOs);
    const rgbppCollector = fastify.container.resolve('rgbppCollector');
    vi.spyOn(rgbppCollector, 'getRgbppUtxoCellsPairs').mockResolvedValueOnce(
      mockRgbppUtxoPairs as RgbppUtxoCellsPair[],
    );

    const response = await fastify.inject({
      method: 'GET',
      url: '/bitcoin/v1/address/tb1pusqtndhyt8mcrggngd0lmah4xshc0aa8vpfsttvtzxd0hxhkrwns7977yu/unspent?only_non_rgbpp_utxos=true',
      headers: {
        Authorization: `Bearer ${token}`,
        Origin: 'https://test.com',
      },
    });
    const data = response.json();

    expect(response.statusCode).toBe(200);
    expect(data).toMatchObject(
      mockUTXOs.filter((utxo) => {
        if (utxo.status.confirmed === false) return false;
        const pair = mockRgbppUtxoPairs.find((pair) => pair.utxo.txid === utxo.txid && pair.utxo.vout === utxo.vout);
        return !pair;
      }),
    );

    await fastify.close();
  });
});
