import axios, { AxiosInstance } from 'axios';
import { TransactionType, UTXOType } from '../routes/bitcoin/types';

export default class ElectrsAPI {
  private request: AxiosInstance;

  constructor(baseURL: string) {
    this.request = axios.create({
      baseURL,
    });
  }

  async getUtxoByAddress(address: string): Promise<UTXOType[]> {
    const response = await this.request.get(`/address/${address}/utxo`);
    return response.data;
  }

  async getTransactionsByAddress(address: string): Promise<TransactionType[]> {
    const response = await this.request.get(`/address/${address}/txs`);
    return response.data;
  }
}
