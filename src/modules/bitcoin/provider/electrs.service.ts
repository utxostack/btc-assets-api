import axios, { AxiosInstance } from 'axios';
import {
  Block,
  BlockDto,
  RecommendedFeesDto,
  Transaction,
  TransactionDto,
  UTXODto,
} from '../bitcoin.schema';
import { IBitcoinDataProvider } from '../interface/bitcoin-data-provider.interface';

export class ElectrsService implements IBitcoinDataProvider {
  private request: AxiosInstance;

  constructor(private baseURL: string) {
    this.request = axios.create({
      baseURL,
    });
  }

  public async getBaseURL(): Promise<string> {
    return this.baseURL;
  }

  public async getFeesRecommended(): Promise<RecommendedFeesDto> {
    throw new Error('Electrs: Recommended fees not available');
  }

  public async postTx({ txhex }: { txhex: string }) {
    const response = await this.request.post('/tx', txhex);
    return response.data;
  }

  public async getAddressTxsUtxo({ address }: { address: string }) {
    const response = await this.request.get<UTXODto[]>(`/address/${address}/utxo`);
    return response.data;
  }

  public async getAddressTxs({ address, after_txid }: { address: string; after_txid?: string }) {
    let url = `/address/${address}/txs`;
    if (after_txid) {
      url += `?after_txid=${after_txid}`;
    }
    const response = await this.request.get<TransactionDto[]>(url);
    return response.data.map((tx: unknown) => Transaction.parse(tx));
  }

  public async getTx({ txid }: { txid: string }) {
    const response = await this.request.get<TransactionDto>(`/tx/${txid}`);
    return Transaction.parse(response.data);
  }

  public async getTxHex({ txid }: { txid: string }) {
    const response = await this.request.get<string>(`/tx/${txid}/hex`);
    return response.data;
  }

  public async getBlock({ hash }: { hash: string }) {
    const response = await this.request.get<BlockDto>(`/block/${hash}`);
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
