import { ChainInfoType } from '../routes/bitcoin/types';
import { BaseRequestService } from './base';

export default class Bitcoind extends BaseRequestService {
  constructor(baseURL: string, username: string, password: string) {
    const credentials = `${username}:${password}`;
    const token = Buffer.from(credentials, 'utf-8').toString('base64');
    super(baseURL, {
      Authorization: `Basic ${token}`,
    });
  }

  private async callMethod<T>(method: string, params: unknown): Promise<T> {
    const response = await this.request.post('', {
      jsonrpc: '1.0',
      id: Date.now(),
      method,
      params,
    });
    return response.data.result;
  }

  // https://developer.bitcoin.org/reference/rpc/getblockchaininfo.html
  public async getBlockchainInfo() {
    return this.callMethod<ChainInfoType>('getblockchaininfo', []);
  }

  // https://developer.bitcoin.org/reference/rpc/sendrawtransaction.html
  public async sendRawTransaction(txHex: string) {
    return this.callMethod<string>('sendrawtransaction', [txHex]);
  }
}
