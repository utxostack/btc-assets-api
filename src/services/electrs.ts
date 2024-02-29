import axios, { AxiosInstance } from 'axios';
import { BlockType, TransactionType, UTXOType } from '../routes/bitcoin/types';
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

  // https://github.com/blockstream/esplora/blob/master/API.md#get-addressaddressutxo
  public async getUtxoByAddress(address: string): Promise<UTXOType[]> {
    const response = await this.request.get(`/address/${address}/utxo`);
    return response.data;
  }

  // https://github.com/blockstream/esplora/blob/master/API.md#get-addressaddresstxs
  public async getTransactionsByAddress(address: string): Promise<TransactionType[]> {
    const response = await this.request.get(`/address/${address}/txs`);
    return response.data;
  }

  // https://github.com/blockstream/esplora/blob/master/API.md#get-txtxid
  public async getTransaction(txid: string): Promise<TransactionType> {
    const response = await this.request.get(`/tx/${txid}`);
    return response.data;
  }

  // https://github.com/blockstream/esplora/blob/master/API.md#get-blockhash
  public async getBlockByHash(hash: string): Promise<BlockType> {
    const response = await this.request.get(`/block/${hash}`);
    return response.data;
  }

  // https://github.com/blockstream/esplora/blob/master/API.md#get-block-heightheight
  public async getBlockByHeight(height: number): Promise<string> {
    const response = await this.request.get(`/block-height/${height}`);
    return response.data;
  }

  // https://github.com/blockstream/esplora/blob/master/API.md#get-blockhashheader
  public async getBlockHeaderByHash(hash: string): Promise<string> {
    const response = await this.request.get(`/block/${hash}/header`);
    return response.data;
  }
}
