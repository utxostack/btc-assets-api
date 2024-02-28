import { BlockType, TransactionType, UTXOType } from '../routes/bitcoin/types';
import { FastifyBaseLogger } from 'fastify';
import { BaseRequestService } from './base';

export default class ElectrsAPI extends BaseRequestService {
  constructor(baseURL: string) {
    super(baseURL);
  }

  public setLogger(logger: FastifyBaseLogger) {
    this.request.interceptors.request.use((config) => {
      logger.info(`[bitcoind] ${JSON.stringify(config.data)}`);
      return config;
    });
    this.request.interceptors.response.use(
      (response) => {
        logger.info(`[bitcoind] ${response.status} ${JSON.stringify(response.data)}`);
        return response;
      },
      (error) => {
        logger.error(
          `[bitcoind] ${error.response?.status} ${JSON.stringify(error.response?.data)}`,
        );
        return Promise.reject(error);
      },
    );
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
