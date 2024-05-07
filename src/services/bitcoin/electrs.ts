import axios, { AxiosInstance } from 'axios';
import { IBitcoinDataProvider } from './interface';
import { Block, RecommendedFees, Transaction, UTXO } from './schema';

export class ElectrsClient implements IBitcoinDataProvider {
  private request: AxiosInstance;

  constructor(baseURL: string) {
    this.request = axios.create({
      baseURL,
    });
  }

  public async getFeesRecommended(): Promise<RecommendedFees> {
    throw new Error('Electrs: Recommended fees not available');
  }

  public async postTx({ txhex }: { txhex: string }) {
    const response = await this.request.post('/tx', txhex);
    return response.data;
  }

  public async getAddressTxsUtxo({ address }: { address: string }) {
    const response = await this.request.get<UTXO[]>(`/address/${address}/utxo`);
    return response.data;
  }

  public async getAddressTxs({ address, after_txid }: { address: string; after_txid?: string }) {
    let url = `/address/${address}/txs`;
    if (after_txid) {
      url += `?after_txid=${after_txid}`;
    }
    const response = await this.request.get<Transaction[]>(url);
    return response.data.map((tx) => Transaction.parse(tx));
  }

  public async getTx({ txid }: { txid: string }) {
    const response = await this.request.get<Transaction>(`/tx/${txid}`);
    return Transaction.parse(response.data);
  }

  public async getTxHex({ txid }: { txid: string }) {
    const response = await this.request.get<string>(`/tx/${txid}/hex`);
    return response.data;
  }

  public async getBlock({ hash }: { hash: string }) {
    const response = await this.request.get<Block>(`/block/${hash}`);
    return Block.parse(response.data);
  }

  public async getBlockHeight({ height }: { height: number }) {
    const response = await this.request.get<string>(`/block-height/${height}`);
    return response.data;
  }

  public async getBlockHeader({ hash }: { hash: string }) {
    const response = await this.request.get<string>(`/block/${hash}/header`);
    return response.data;
  }

  public async getBlockTxids({ hash }: { hash: string }) {
    const response = await this.request.get<string[]>(`/block/${hash}/txids`);
    return response.data;
  }

  public async getBlocksTipHash() {
    const response = await this.request.get<string>('/blocks/tip/hash');
    return response.data;
  }
}
