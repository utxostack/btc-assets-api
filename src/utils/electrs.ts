import axios, { AxiosInstance, AxiosResponse } from 'axios';
import { Transaction, Block } from 'bitcoinjs-lib';
import { Cradle } from '../container';
import { UTXO } from '../routes/bitcoin/types';
import { addLoggerInterceptor } from './interceptors';

export default class ElectrsClient {
  private request: AxiosInstance;

  constructor({ env, logger }: Cradle) {
    this.request = axios.create({
      baseURL: env.BITCOIN_ELECTRS_API_URL,
    });
    addLoggerInterceptor(this.request, logger);
  }

  private async get<T>(path: string): Promise<AxiosResponse<T>> {
    const response = await this.request.get(path);
    return response;
  }

  public async sendRawTransaction(hex: string) {
    const response = await this.request.post('/tx', hex);
    return response.data;
  }

  public async getUtxoByAddress(address: string) {
    const response = await this.get<UTXO[]>(`/address/${address}/utxo`);
    return response.data;
  }

  public async getTransactionsByAddress(address: string) {
    const response = await this.get<Transaction[]>(`/address/${address}/txs`);
    return response.data;
  }

  public async getTransaction(txid: string) {
    const response = await this.get<Transaction>(`/tx/${txid}`);
    return response.data;
  }

  public async getTransactionHex(txid: string) {
    const response = await this.get<string>(`/tx/${txid}/hex`);
    return response.data;
  }

  public async getBlockByHash(hash: string) {
    const response = await this.get<Block>(`/block/${hash}`);
    return response.data;
  }

  public async getBlockHashByHeight(height: number) {
    const response = await this.get<string>(`/block-height/${height}`);
    return response.data;
  }

  public async getBlockHeaderByHash(hash: string) {
    const response = await this.get<string>(`/block/${hash}/header`);
    return response.data;
  }

  public async getBlockTxIdsByHash(hash: string) {
    const response = await this.get<string[]>(`/block/${hash}/txids`);
    return response.data;
  }

  public async getBlocksTipHash() {
    const response = await this.get<string>('/blocks/tip/hash');
    return response.data;
  }
}
