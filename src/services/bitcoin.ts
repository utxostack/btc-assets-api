import mempoolJS from '@mempool/mempool.js';
import { Cradle } from '../container';
import { Block, ChainInfo, Transaction, UTXO } from '../routes/bitcoin/types';
import { NetworkType } from '../constants';
import { AxiosError } from 'axios';

export class BitcoinMempoolAPIError extends Error {
  public statusCode = 500;

  constructor(message: string) {
    super(message);
    this.name = this.constructor.name;
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const wrapTry = async <T extends (...args: any) => any>(fn: T): Promise<ReturnType<T>> => {
  if (typeof fn !== 'function') {
    throw new Error('wrapTry: fn must be a function');
  }
  return fn().catch((err: Error) => {
    if ((err as AxiosError).isAxiosError) {
      const error = new BitcoinMempoolAPIError(err.message);
      if ((err as AxiosError).response) {
        error.statusCode = (err as AxiosError).response?.status || 500;
      }
      throw error;
    }
    throw err;
  });
};

export default class Bitcoin {
  private mempool: ReturnType<typeof mempoolJS>;
  private cradle: Cradle;

  constructor(cradle: Cradle) {
    const url = new URL(cradle.env.BITCOIN_MEMPOOL_SPACE_API_URL);
    this.mempool = mempoolJS({
      hostname: url.hostname,
      network: cradle.env.NETWORK,
    });
    this.cradle = cradle;
  }

  public async checkNetwork(network: NetworkType) {
    const hash = await this.mempool.bitcoin.blocks.getBlockHeight({ height: 0 });
    switch (network) {
      case NetworkType.mainnet:
        // Bitcoin mainnet genesis block hash
        if (hash !== '000000000019d6689c085ae165831e934ff763ae46a2a6c172b3f1b60a8ce26f') {
          throw new Error('Mempool API is not running on mainnet');
        }
        break;
      case NetworkType.testnet:
        // Bitcoin testnet genesis block hash
        if (hash !== '000000000933ea01ad0ee984209779baaec3ced90fa3f408719526f8d77f4943') {
          throw new Error('Mempool API is not running on testnet');
        }
        break;
      default:
    }
  }

  public async getBlockchainInfo(): Promise<ChainInfo> {
    const hash = await this.mempool.bitcoin.blocks.getBlocksTipHash();
    const tip = await this.mempool.bitcoin.blocks.getBlock({ hash });

    const { difficulty, mediantime } = tip;
    return {
      chain: this.cradle.env.NETWORK === 'mainnet' ? 'main' : 'test',
      blocks: tip.height,
      bestblockhash: hash,
      difficulty,
      mediantime,
    };
  }

  public async sendRawTransaction(txhex: string): Promise<string> {
    return wrapTry(async () => {
      const txid = await this.mempool.bitcoin.transactions.postTx({ txhex });
      return txid as string;
    });
  }

  public async getUtxoByAddress(address: string): Promise<UTXO[]> {
    return wrapTry(async () => {
      const utxo = await this.mempool.bitcoin.addresses.getAddressTxsUtxo({ address });
      return utxo.map((utxo) => UTXO.parse(utxo));
    });
  }

  public async getTransactionsByAddress(address: string): Promise<Transaction[]> {
    return wrapTry(async () => {
      const txs = await this.mempool.bitcoin.addresses.getAddressTxs({ address });
      return txs.map((tx) => Transaction.parse(tx));
    });
  }

  public async getTransaction(txid: string): Promise<Transaction> {
    return wrapTry(async () => {
      const tx = await this.mempool.bitcoin.transactions.getTx({ txid });
      return Transaction.parse(tx);
    });
  }

  public async getTransactionHex(txid: string): Promise<string> {
    return wrapTry(() => this.mempool.bitcoin.transactions.getTxHex({ txid }));
  }

  public async getBlockByHash(hash: string): Promise<Block> {
    return wrapTry(async () => {
      const block = await this.mempool.bitcoin.blocks.getBlock({ hash });
      return block;
    });
  }

  public async getBlockByHeight(height: number): Promise<Block> {
    return wrapTry(async () => {
      const hash = await this.mempool.bitcoin.blocks.getBlockHeight({ height });
      const block = await this.mempool.bitcoin.blocks.getBlock({ hash });
      return block;
    });
  }

  public async getBlockHashByHeight(height: number): Promise<string> {
    return wrapTry(async () => {
      return this.mempool.bitcoin.blocks.getBlockHeight({ height });
    });
  }

  public async getBlockHeaderByHash(hash: string) {
    return wrapTry(async () => {
      return this.mempool.bitcoin.blocks.getBlockHeader({ hash });
    });
  }

  public async getBlockHeaderByHeight(height: number) {
    return wrapTry(async () => {
      const hash = await this.mempool.bitcoin.blocks.getBlockHeight({ height });
      return this.getBlockHeaderByHash(hash);
    });
  }

  public async getBlockTxIdsByHash(hash: string): Promise<string[]> {
    return wrapTry(async () => {
      const txids = await this.mempool.bitcoin.blocks.getBlockTxids({ hash });
      return txids;
    });
  }

  public async getTip(): Promise<number> {
    return wrapTry(async () => {
      return this.mempool.bitcoin.blocks.getBlocksTipHeight();
    });
  }
}
