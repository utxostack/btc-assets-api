import container from '../../src/container';
import { describe, test, beforeEach, afterEach, vi, expect } from 'vitest';
import BitcoinSPV from '../../src/services/spv';

describe('BitcoinSPV', () => {
  let bitcoinSPV: BitcoinSPV;

  beforeEach(async () => {
    const cradle = container.cradle;
    bitcoinSPV = new BitcoinSPV(cradle);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  test('getTxProof: throw BitcoinSPVError', async () => {
    vi.spyOn(bitcoinSPV['request'], 'post').mockResolvedValue({
      data: {
        jsonrpc: '2.0',
        error: {
          code: 23102,
          message:
            'target transaction is in header#2583777 and it requires 5 confirmations, but the tip header in local storage is header#2583781',
        },
        id: 'aa1a7882-9c0a-4eaa-87e8-1ed906b957f8',
      },
    });
    await expect(
      bitcoinSPV.getTxProof('ede749ecee5e607e761e4fffb6d754799498056872456a7d33abe426d7b9951c', 0, 100),
    ).rejects.toThrowErrorMatchingSnapshot();
  });

  test('getTxProof: get proof successfuly', async () => {
    vi.spyOn(bitcoinSPV['request'], 'post').mockResolvedValue({
      data: {
        jsonrpc: '2.0',
        result: {
          "spv_client": {
            "tx_hash": "0x5e570545c3ffd656199d3babd85f05377ac91b396126b166cf370e2f0edddae5",
            "index": "0x1"
          },
          "proof": "00000000000000"
        },
        id: 'aa1a7882-9c0a-4eaa-87e8-1ed906b957f8',
      },
    });
    const proof = await bitcoinSPV.getTxProof('ede749ecee5e607e761e4fffb6d754799498056872456a7d33abe426d7b9951c', 0, 100);
    expect(proof).toHaveProperty('spv_client');
    expect(proof).toHaveProperty('proof');
  });
});
