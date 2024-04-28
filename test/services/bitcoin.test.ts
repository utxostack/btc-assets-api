import container from '../../src/container';
import { describe, test, beforeEach, expect } from 'vitest';
import BitcoinClient from '../../src/services/bitcoin';
import { ElectrsClient } from '../../src/services/bitcoin/electrs';
import { MempoolClient } from '../../src/services/bitcoin/mempool';

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
});
