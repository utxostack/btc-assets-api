import { Cradle } from '../../container';
import { IBitcoinDataProvider } from './interface';
import mempoolJS from '@cell-studio/mempool.js';
import { Block, RecommendedFees, Transaction, UTXO } from './schema';

export class MempoolClient implements IBitcoinDataProvider {
  private mempool: ReturnType<typeof mempoolJS>;

  constructor(cradle: Cradle) {
    if (!cradle.env.BITCOIN_MEMPOOL_SPACE_API_URL) {
      throw new Error('BITCOIN_MEMPOOL_SPACE_API_URL is required');
    }
    const url = new URL(cradle.env.BITCOIN_MEMPOOL_SPACE_API_URL);
    this.mempool = mempoolJS({
      hostname: url.hostname,
      network: cradle.env.NETWORK,
    });
  }

  public async getFeesRecommended() {
    const response = await this.mempool.bitcoin.fees.getFeesRecommended();
    return RecommendedFees.parse(response);
  }

  public async postTx({ txhex }: { txhex: string }) {
    const response = await this.mempool.bitcoin.transactions.postTx({ txhex });
    return response as string;
  }

  public async getAddressTxsUtxo({ address }: { address: string }) {
    const response = await this.mempool.bitcoin.addresses.getAddressTxsUtxo({ address });
    return response.map((utxo) => UTXO.parse(utxo));
  }

  public async getAddressTxs({ address, after_txid }: { address: string; after_txid?: string }) {
    const response = await this.mempool.bitcoin.addresses.getAddressTxs({ address, after_txid });
    return response.map((tx) => Transaction.parse(tx));
  }

  public async getTx({ txid }: { txid: string }) {
    const response = await this.mempool.bitcoin.transactions.getTx({ txid });
    return Transaction.parse(response);
  }

  public async getTxHex({ txid }: { txid: string }) {
    const response = await this.mempool.bitcoin.transactions.getTxHex({ txid });
    return response;
  }

  public async getBlock({ hash }: { hash: string }) {
    const response = await this.mempool.bitcoin.blocks.getBlock({ hash });
    return Block.parse(response);
  }

  public async getBlockHeight({ height }: { height: number }) {
    const response = await this.mempool.bitcoin.blocks.getBlockHeight({ height });
    return response;
  }

  public async getBlockHeader({ hash }: { hash: string }) {
    const response = await this.mempool.bitcoin.blocks.getBlockHeader({ hash });
    return response;
  }

  public async getBlockTxids({ hash }: { hash: string }) {
    const response = await this.mempool.bitcoin.blocks.getBlockTxids({ hash });
    return response;
  }

  public async getBlocksTipHash() {
    const response = await this.mempool.bitcoin.blocks.getBlocksTipHash();
    return response;
  }
}
