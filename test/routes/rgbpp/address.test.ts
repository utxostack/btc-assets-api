import { beforeEach, expect, test, vi } from 'vitest';
import { buildFastify } from '../../../src/app';
import { describe } from 'node:test';
import mockUTXOs from '../../__fixtures__/utxo.mock.json';
import mockRgbppUtxoPairs from '../../__fixtures__/rgbpp-utxo-pairs.mock.json';
import { RgbppUtxoCellsPair } from '../../../src/services/rgbpp';

let token: string;

describe('/rgbpp/v1/address', () => {
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

  test('/:btc_address/assets', async () => {
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
      url: '/rgbpp/v1/address/tb1pusqtndhyt8mcrggngd0lmah4xshc0aa8vpfsttvtzxd0hxhkrwns7977yu/assets',
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

  test('/:btc_address/balance - without pending_amount', async () => {
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
      url: '/rgbpp/v1/address/tb1pusqtndhyt8mcrggngd0lmah4xshc0aa8vpfsttvtzxd0hxhkrwns7977yu/balance',
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

  test('/:btc_address/balance - with pending_amount', async () => {
    const fastify = buildFastify();
    await fastify.ready();

    const utxoSyncer = fastify.container.resolve('utxoSyncer');
    vi.spyOn(utxoSyncer, 'getUtxosByAddress').mockResolvedValueOnce(mockUTXOs);
    const rgbppCollector = fastify.container.resolve('rgbppCollector');
    vi.spyOn(rgbppCollector, 'getRgbppUtxoCellsPairs').mockResolvedValueOnce(
      mockRgbppUtxoPairs as RgbppUtxoCellsPair[],
    );
    const transactionProcessor = fastify.container.resolve('transactionProcessor');
    const getPendingOuputCellsByTxidSpy = vi
      .spyOn(transactionProcessor, 'getPendingOuputCellsByTxid')
      .mockResolvedValueOnce([
        {
          cellOutput: {
            capacity: '0x5e9f52687',
            lock: {
              codeHash: '0x61ca7a4796a4eb19ca4f0d065cb9b10ddcf002f10f7cbb810c706cb6bb5c3248',
              args: '0x010000000000000000000000000000000000000000000000000000000000000000000000',
              hashType: 'type',
            },
            type: {
              codeHash: '0x25c29dc317811a6f6f3985a7a9ebc4838bd388d19d0feeecf0bcd60f6c0975bb',
              args: '0x30d3fbec9ceba691770d57c6d06bdb98cf0f82bef0ca6e87687a118d6ce1e7b7',
              hashType: 'type',
            },
          },
          data: '0x00e1f505000000000000000000000000',
        },
        {
          cellOutput: {
            capacity: '0x5e9f52687',
            lock: {
              codeHash: '0x61ca7a4796a4eb19ca4f0d065cb9b10ddcf002f10f7cbb810c706cb6bb5c3248',
              args: '0x010000000000000000000000000000000000000000000000000000000000000000000000',
              hashType: 'type',
            },
            type: {
              codeHash: '0x25c29dc317811a6f6f3985a7a9ebc4838bd388d19d0feeecf0bcd60f6c0975bb',
              args: '0x8c556e92974a8dd8237719020a259d606359ac2cc958cb8bda77a1c3bb3cd93b',
              hashType: 'type',
            },
          },
          data: '0x00e1f505000000000000000000000000',
        },
        {
          cellOutput: {
            capacity: '0x5e9f52687',
            lock: {
              codeHash: '0x61ca7a4796a4eb19ca4f0d065cb9b10ddcf002f10f7cbb810c706cb6bb5c3248',
              args: '0x010000000000000000000000000000000000000000000000000000000000000001234567',
              hashType: 'type',
            },
            type: {
              codeHash: '0x25c29dc317811a6f6f3985a7a9ebc4838bd388d19d0feeecf0bcd60f6c0975bb',
              args: '0x8c556e92974a8dd8237719020a259d606359ac2cc958cb8bda77a1c3bb3cd93b',
              hashType: 'type',
            },
          },
          data: '0x00e1f505000000000000000000000000',
        },
      ]);

    const response = await fastify.inject({
      method: 'GET',
      url: '/rgbpp/v1/address/tb1pusqtndhyt8mcrggngd0lmah4xshc0aa8vpfsttvtzxd0hxhkrwns7977yu/balance',
      headers: {
        Authorization: `Bearer ${token}`,
        Origin: 'https://test.com',
      },
    });
    const data = response.json();

    expect(getPendingOuputCellsByTxidSpy).toBeCalledTimes(2);
    expect(getPendingOuputCellsByTxidSpy).toHaveBeenCalledWith(
      'aab2d8fc3f064087450057ccb6012893cf219043d8c915fe64c5322c0eeb6fd2',
    );
    expect(getPendingOuputCellsByTxidSpy).toHaveBeenCalledWith(
      '989f4e03179e17cbb6edd446f57ea6107a40ba23441056653f1cc34b7dd1e5ba',
    );
    expect(response.statusCode).toBe(200);
    expect(data).toMatchSnapshot();

    await fastify.close();
  });
});
