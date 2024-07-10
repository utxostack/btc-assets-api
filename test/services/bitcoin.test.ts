import container from '../../src/container';
import { describe, test, beforeEach, expect, vi } from 'vitest';
import BitcoinClient, { BitcoinClientAPIError } from '../../src/services/bitcoin';
import { ElectrsClient } from '../../src/services/bitcoin/electrs';
import { MempoolClient } from '../../src/services/bitcoin/mempool';
import { AxiosError } from 'axios';

describe('BitcoinClient', () => {
  let bitcoin: BitcoinClient;

  beforeEach(async () => {
    const cradle = container.cradle;
    bitcoin = new BitcoinClient(cradle);
  });

  test('BitcoinClient: Should be use data providers', async () => {
    if (container.cradle.env.BITCOIN_DATA_PROVIDER === 'mempool') {
      expect(bitcoin['source'].constructor).toBe(MempoolClient);
      expect(bitcoin['fallback']?.constructor).toBe(ElectrsClient);
    } else {
      expect(bitcoin['source'].constructor).toBe(ElectrsClient);
      expect(bitcoin['fallback']?.constructor).toBe(MempoolClient);
    }
  });

  test('BitcoinClient: throw BitcoinClientError when source provider failed', async () => {
    bitcoin['fallback'] = undefined;
    vi.spyOn(bitcoin['source'], 'postTx').mockRejectedValue(new AxiosError('source provider error'));
    expect(bitcoin.postTx({ txhex: 'test' })).rejects.toBeInstanceOf(BitcoinClientAPIError);
    expect(bitcoin.postTx({ txhex: 'test' })).rejects.toThrowError('source provider error');
  });

  test('BitcoinClient: throw BitcoinClientError when fallback provider failed', async () => {
    vi.spyOn(bitcoin['source'], 'postTx').mockRejectedValue(new AxiosError('source provider error'));
    vi.spyOn(bitcoin['fallback']!, 'postTx').mockRejectedValue(new AxiosError('fallback provider error'));
    expect(bitcoin.postTx({ txhex: 'test' })).rejects.toBeInstanceOf(BitcoinClientAPIError);
    expect(bitcoin.postTx({ txhex: 'test' })).rejects.toThrowError('fallback provider error');
  });
});
