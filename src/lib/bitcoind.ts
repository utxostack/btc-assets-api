import axios, { AxiosInstance } from 'axios';
import { ChainInfoType } from '../routes/bitcoin/types';

export default class Bitcoind {
  private request: AxiosInstance;

  constructor(baseURL: string, username: string, password: string) {
    const credentials = `${username}:${password}`;
    const token = Buffer.from(credentials, 'utf-8').toString('base64');
    this.request = axios.create({
      baseURL,
      headers: {
        Authorization: `Basic ${token}`,
      },
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
