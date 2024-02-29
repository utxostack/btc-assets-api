import { ChainInfoType } from '../routes/bitcoin/types';
import axios, { AxiosInstance } from 'axios';
import { addLoggerInterceptor } from '../utils/interceptors';
import { Cradle } from '../container';

export default class Bitcoind {
  private request: AxiosInstance;

  constructor({ env, logger }: Cradle) {
    const {
      BITCOIN_JSON_RPC_USERNAME: username,
      BITCOIN_JSON_RPC_PASSWORD: password,
      BITCOIN_JSON_RPC_URL: baseURL,
    } = env;
    const credentials = `${username}:${password}`;
    const token = Buffer.from(credentials, 'utf-8').toString('base64');

    this.request = axios.create({
      baseURL,
      headers: {
        Authorization: `Basic ${token}`,
      },
    });
    addLoggerInterceptor(this.request, logger);
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
