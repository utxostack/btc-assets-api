import axios, { AxiosInstance } from 'axios';
import * as Sentry from '@sentry/node';
import { addLoggerInterceptor } from '../utils/interceptors';
import { Cradle } from '../container';
import { randomUUID } from 'node:crypto';
import * as z from 'zod';
import { remove0x } from '@rgbpp-sdk/btc';

export const TxProof = z.object({
  spv_client: z.object({
    tx_hash: z.string(),
    index: z.string(),
  }),
  proof: z.string(),
});
export type TxProof = z.infer<typeof TxProof>;

/**
 *
 */
export default class BitcoinSPV {
  private request: AxiosInstance;

  constructor({ env, logger }: Cradle) {
    const { BITCOIN_SPV_SERVICE_URL } = env;
    this.request = axios.create({
      baseURL: BITCOIN_SPV_SERVICE_URL,
    });
    addLoggerInterceptor(this.request, logger);
  }

  private async callMethod<T>(method: string, params: unknown): Promise<T> {
    return Sentry.startSpan({ op: this.constructor.name, name: method }, async () => {
      const id = randomUUID();
      const response = await this.request.post('', {
        jsonrpc: '2.0',
        id,
        method,
        params,
      });
      if (response.data.error) {
        throw new Error(response.data.error.message);
      }
      return response.data.result;
    });
  }

  // https://github.com/ckb-cell/ckb-bitcoin-spv-service?tab=readme-ov-file#json-rpc-api-reference
  public async getTxProof(txid: string, index: number, confirmations: number) {
    return this.callMethod<TxProof>('getTxProof', [remove0x(txid), index, confirmations]);
  }
}
