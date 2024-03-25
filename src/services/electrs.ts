import axios, { AxiosInstance, AxiosResponse } from 'axios';
import { Block, Transaction, UTXO } from '../routes/bitcoin/types';
import * as Sentry from '@sentry/node';
import { Cradle } from '../container';
import { addLoggerInterceptor } from '../utils/interceptors';
import { NetworkType } from '../constants';

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
      if (response.data.error) {
        throw new Error(response.data.error.message);
      }
      return response;
    });
  }

  public async checkNetwork(network: NetworkType) {
    const hash = await this.getBlockByHeight(0);
    switch (network) {
      case NetworkType.mainnet:
        // Bitcoin mainnet genesis block hash
        if (hash !== '000000000019d6689c085ae165831e934ff763ae46a2a6c172b3f1b60a8ce26f') {
          throw new Error('Electrs API is not running on mainnet');
        }
        break;
      case NetworkType.testnet:
        // Bitcoin testnet genesis block hash
        if (hash !== '000000000933ea01ad0ee984209779baaec3ced90fa3f408719526f8d77f4943') {
          throw new Error('Electrs API is not running on testnet');
        }
        break;
      default:
    }
  }

  // https://github.com/blockstream/esplora/blob/master/API.md#get-addressaddressutxo
  public async getUtxoByAddress(address: string) {
    const response = await this.get<UTXO[]>(`/address/${address}/utxo`);
    return response.data;
  }

  // https://github.com/blockstream/esplora/blob/master/API.md#get-addressaddresstxs
  public async getTransactionsByAddress(address: string) {
    const response = await this.get<Transaction[]>(`/address/${address}/txs`);
    return response.data;
  }

  // https://github.com/blockstream/esplora/blob/master/API.md#get-txtxid
  public async getTransaction(txid: string) {
    const response = await this.get<Transaction>(`/tx/${txid}`);
    return response.data;
  }

  // https://github.com/Blockstream/esplora/blob/master/API.md#get-txtxidhex
  public async getTransactionHex(txid: string) {
    const response = await this.get<string>(`/tx/${txid}/hex`);
    return response.data;
  }

  // https://github.com/blockstream/esplora/blob/master/API.md#get-blockhash
  public async getBlockByHash(hash: string) {
    const response = await this.get<Block>(`/block/${hash}`);
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

  // https://github.com/Blockstream/esplora/blob/master/API.md#get-blockhashtxids
  public async getBlockTxIdsByHash(hash: string) {
    const response = await this.get<string[]>(`/block/${hash}/txids`);
    return response.data;
  }
}
