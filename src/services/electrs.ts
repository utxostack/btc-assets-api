import { BlockType, TransactionType, UTXOType } from '../routes/bitcoin/types';
import { BaseRequestService } from './base';

export default class ElectrsAPI extends BaseRequestService {
  constructor(baseURL: string) {
    super(baseURL);
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
}
