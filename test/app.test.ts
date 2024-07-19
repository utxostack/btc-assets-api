import { expect, test } from 'vitest';
import { buildFastify } from '../src/app';

test('`/docs/json` - 200', async () => {
  const fastify = buildFastify();
  await fastify.ready();

  const response = await fastify.inject({
    method: 'GET',
    url: '/docs/json',
  });
  const data = response.json();

  expect(response.statusCode).toBe(200);
  expect(data.openapi).toBe('3.1.0');
  expect(Object.keys(data.paths)).toStrictEqual([
    '/token/generate',
    '/bitcoin/v1/info',
    '/bitcoin/v1/block/{hash}',
    '/bitcoin/v1/block/{hash}/txids',
    '/bitcoin/v1/block/{hash}/header',
    '/bitcoin/v1/block/height/{height}',
    '/bitcoin/v1/transaction',
    '/bitcoin/v1/transaction/{txid}',
    '/bitcoin/v1/transaction/{txid}/hex',
    '/bitcoin/v1/address/{address}/balance',
    '/bitcoin/v1/address/{address}/unspent',
    '/bitcoin/v1/address/{address}/txs',
    '/bitcoin/v1/fees/recommended',
    '/rgbpp/v1/transaction/ckb-tx',
    '/rgbpp/v1/transaction/{btc_txid}',
    '/rgbpp/v1/transaction/{btc_txid}/job',
    '/rgbpp/v1/transaction/retry',
    '/rgbpp/v1/assets/{btc_txid}',
    '/rgbpp/v1/assets/{btc_txid}/{vout}',
    '/rgbpp/v1/address/{btc_address}/assets',
    '/rgbpp/v1/address/{btc_address}/balance',
    '/rgbpp/v1/address/{btc_address}/activity',
    '/rgbpp/v1/btc-spv/proof',
    '/rgbpp/v1/paymaster/info',
    '/cron/process-transactions',
    '/cron/unlock-cells',
    '/cron/sync-utxo',
    '/cron/collect-rgbpp-cells',
  ]);

  await fastify.close();
});
