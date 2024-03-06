import axios, { AxiosInstance, AxiosResponse } from 'axios';
import { BlockType, TransactionType, UTXOType } from '../routes/bitcoin/types';
import * as Sentry from '@sentry/node';
import { Cradle } from '../container';
import { addLoggerInterceptor } from '../utils/interceptors';

export default class ElectrsAPI {
  private request: AxiosInstance;

  constructor({ env, logger }: Cradle) {
    this.request = axios.create({
      baseURL: env.BITCOIN_ELECTRS_API_URL,
    });
    addLoggerInterceptor(this.request, logger);
  }

  private async get<T>(path: string): Promise<AxiosResponse<T>> {
    return Sentry.startSpan({ op: this.constructor.name, name: path }, async () => {
      const response = await this.request.get(path);
      return response;
    });
  }

  // https://github.com/blockstream/esplora/blob/master/API.md#get-addressaddressutxo
  public async getUtxoByAddress(address: string) {
    const response = await this.get<UTXOType[]>(`/address/${address}/utxo`);
    return response.data;
  }

  // https://github.com/blockstream/esplora/blob/master/API.md#get-addressaddresstxs
  public async getTransactionsByAddress(address: string) {
    const response = await this.get<TransactionType[]>(`/address/${address}/txs`);
    return response.data;
  }

  // https://github.com/blockstream/esplora/blob/master/API.md#get-txtxid
  public async getTransaction(txid: string) {
    const response = await this.get<TransactionType>(`/tx/${txid}`);
    return response.data;
  }

  // https://github.com/blockstream/esplora/blob/master/API.md#get-blockhash
  public async getBlockByHash(hash: string) {
    const response = await this.get<BlockType>(`/block/${hash}`);
    return response.data;
  }

  // https://github.com/blockstream/esplora/blob/master/API.md#get-block-heightheight
  public async getBlockByHeight(height: number) {
    const response = await this.get<string>(`/block-height/${height}`);
    return response.data;
  }

  // https://github.com/blockstream/esplora/blob/master/API.md#get-blockhashheader
  public async getBlockHeaderByHash(hash: string) {
    const response = await this.get<string>(`/block/${hash}/header`);
    return response.data;
  }
}
