import mempoolJS from '@mempool/mempool.js';
import { Cradle } from '../container';
import { Block, ChainInfo, Transaction, UTXO } from '../routes/bitcoin/types';
import { NetworkType } from '../constants';
import { AxiosError } from 'axios';
import Electrs from '../utils/electrs';
import * as Sentry from '@sentry/node';

// https://github.com/mempool/electrs/blob/d4f788fc3d7a2b4eca4c5629270e46baba7d0f19/src/errors.rs#L6
export enum MempoolErrorMessage {
  Connection = 'Connection error',
  Interrupt = 'Interruption by external signal',
  TooManyUtxos = 'Too many unspent transaction outputs',
  TooManyTxs = 'Too many history transactions',
  ElectrumClient = 'Electrum client error',
}

export enum BitcoinClientErrorCode {
  Connection = 0x1000, // 4096
  Interrupt = 0x1001, // 4097
  TooManyUtxos = 0x1002, // 4098
  TooManyTxs = 0x1003, // 4099
  ElectrumClient = 0x1004, // 4100

  MempoolUnknown = 0x1111, // 4369
}

const BitcoinClientErrorMap = {
  [MempoolErrorMessage.Connection]: BitcoinClientErrorCode.Connection,
  [MempoolErrorMessage.Interrupt]: BitcoinClientErrorCode.Interrupt,
  [MempoolErrorMessage.TooManyUtxos]: BitcoinClientErrorCode.TooManyUtxos,
  [MempoolErrorMessage.TooManyTxs]: BitcoinClientErrorCode.TooManyTxs,
  [MempoolErrorMessage.ElectrumClient]: BitcoinClientErrorCode.ElectrumClient,
};

export class BitcoinClientAPIError extends Error {
  public statusCode = 500;
  public errorCode: BitcoinClientErrorCode;

  constructor(message: string) {
    super(message);
    this.name = this.constructor.name;

    const errorKey = Object.keys(BitcoinClientErrorMap).find((msg) => message.startsWith(msg));
    this.errorCode = BitcoinClientErrorMap[errorKey as MempoolErrorMessage] ?? BitcoinClientErrorCode.MempoolUnknown;
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const wrapTry = async <T extends (...args: any) => Promise<any>>(fn: T): Promise<ReturnType<T>> => {
  if (typeof fn !== 'function') {
    throw new Error('wrapTry: fn must be a function');
  }

  try {
    const ret = await fn();
    return ret;
  } catch (err) {
    if ((err as AxiosError).isAxiosError) {
      const error = new BitcoinClientAPIError((err as AxiosError).message);
      if ((err as AxiosError).response) {
        error.statusCode = (err as AxiosError).response?.status || 500;
      }
      throw error;
    }
    throw err;
  }
};

export default class BitcoinClient {
  private cradle: Cradle;
  private mempool: ReturnType<typeof mempoolJS>;
  private electrs?: Electrs;

  constructor(cradle: Cradle) {
    this.cradle = cradle;

    const url = new URL(cradle.env.BITCOIN_MEMPOOL_SPACE_API_URL);
    this.mempool = mempoolJS({
      hostname: url.hostname,
      network: cradle.env.NETWORK,
    });

    if (cradle.env.BITCOIN_ELECTRS_API_URL) {
      this.electrs = new Electrs(cradle);
    }
  }

  public async checkNetwork(network: NetworkType) {
    const hash = await this.getBlockHashByHeight(0);
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
      try {
        const txid = await this.mempool.bitcoin.transactions.postTx({ txhex });
        return txid as string;
      } catch (err) {
        this.cradle.logger.error(err);
        Sentry.captureException(err);
        if (this.electrs) {
          return this.electrs.sendRawTransaction(txhex);
        }
        throw err;
      }
    });
  }

  public async getUtxoByAddress(address: string): Promise<UTXO[]> {
    return wrapTry(async () => {
      try {
        const utxo = await this.mempool.bitcoin.addresses.getAddressTxsUtxo({ address });
        return utxo.map((utxo) => UTXO.parse(utxo));
      } catch (err) {
        this.cradle.logger.error(err);
        Sentry.captureException(err);
        if (this.electrs) {
          return this.electrs.getUtxoByAddress(address);
        }
        throw err;
      }
    });
  }

  public async getTransactionsByAddress(address: string, after_txid?: string): Promise<Transaction[]> {
    return wrapTry(async () => {
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-expect-error after_txid is not defined in the type definition
      const txs = await this.mempool.bitcoin.addresses.getAddressTxs({ address, after_txid });
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
      try {
        const hash = await this.mempool.bitcoin.blocks.getBlockHeight({ height });
        const block = await this.mempool.bitcoin.blocks.getBlock({ hash });
        return Block.parse(block);
      } catch (err) {
        this.cradle.logger.error(err);
        Sentry.captureException(err);
        if (this.electrs) {
          const hash = await this.electrs.getBlockHashByHeight(height);
          const block = await this.electrs.getBlockByHash(hash);
          return Block.parse(block);
        }
        throw err;
      }
    });
  }

  public async getBlockHashByHeight(height: number): Promise<string> {
    return wrapTry(async () => {
      try {
        const hash = await this.mempool.bitcoin.blocks.getBlockHeight({ height });
        return hash;
      } catch (err) {
        this.cradle.logger.error(err);
        Sentry.captureException(err);
        if (this.electrs) {
          const hash = await this.electrs.getBlockHashByHeight(height);
          return hash;
        }
        throw err;
      }
    });
  }

  public async getBlockHeaderByHash(hash: string) {
    return wrapTry(async () => {
      try {
        return this.mempool.bitcoin.blocks.getBlockHeader({ hash });
      } catch (err) {
        this.cradle.logger.error(err);
        Sentry.captureException(err);
        if (this.electrs) {
          return this.electrs.getBlockHeaderByHash(hash);
        }
        throw err;
      }
    });
  }

  public async getBlockTxIdsByHash(hash: string): Promise<string[]> {
    return wrapTry(async () => {
      try {
        const txids = await this.mempool.bitcoin.blocks.getBlockTxids({ hash });
        return txids;
      } catch (err) {
        this.cradle.logger.error(err);
        Sentry.captureException(err);
        if (this.electrs) {
          return this.electrs.getBlockTxIdsByHash(hash);
        }
        throw err;
      }
    });
  }

  public async getTip(): Promise<number> {
    return wrapTry(async () => {
      try {
        return this.mempool.bitcoin.blocks.getBlocksTipHeight();
      } catch (err) {
        this.cradle.logger.error(err);
        Sentry.captureException(err);
        if (this.electrs) {
          return this.electrs.getTip();
        }
        throw err;
      }
    });
  }
}
