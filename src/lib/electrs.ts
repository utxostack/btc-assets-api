import axios, { AxiosInstance } from 'axios';
import { BlockType, TransactionType, UTXOType } from '../routes/bitcoin/types';

export default class ElectrsAPI {
  private request: AxiosInstance;

  constructor(baseURL: string) {
    this.request = axios.create({
      baseURL,
    });
  }

  // https://github.com/blockstream/esplora/blob/master/API.md#get-addressaddressutxo
  async getUtxoByAddress(address: string): Promise<UTXOType[]> {
    const response = await this.request.get(`/address/${address}/utxo`);
    return response.data;
  }

  // https://github.com/blockstream/esplora/blob/master/API.md#get-addressaddresstxs
  async getTransactionsByAddress(address: string): Promise<TransactionType[]> {
    const response = await this.request.get(`/address/${address}/txs`);
    return response.data;
  }

  // https://github.com/blockstream/esplora/blob/master/API.md#get-txtxid
  async getTransaction(txid: string): Promise<TransactionType> {
    const response = await this.request.get(`/tx/${txid}`);
    return response.data;
  }

  // https://github.com/blockstream/esplora/blob/master/API.md#get-blockhash
  async getBlockByHash(hash: string): Promise<BlockType> {
    const response = await this.request.get(`/block/${hash}`);
    return response.data;
  }
}
