import { ChainInfo } from '../routes/bitcoin/types';
import axios, { AxiosInstance } from 'axios';
import * as Sentry from '@sentry/node';
import { addLoggerInterceptor } from '../utils/interceptors';
import { Cradle } from '../container';
import { NetworkType } from '../constants';
import { randomUUID } from 'node:crypto';

type TransactionCategory = 'send' | 'receive' | 'generate' | 'immature' | 'orphan';

type Bip125Replaceable = 'yes' | 'no' | 'unknown';

interface TransactionDetail {
  involvesWatchonly?: boolean;
  address: string;
  category: TransactionCategory;
  amount: number;
  label?: string;
  vout: number;
  fee?: number;
  abandoned?: boolean;
}

interface Transaction {
  amount: number;
  fee?: number;
  confirmations: number;
  generated?: boolean;
  trusted?: boolean;
  blockhash?: string;
  blockheight?: number;
  blockindex?: number;
  blocktime?: number;
  txid: string;
  walletconflicts: string[];
  time: number;
  timereceived: number;
  comment?: string;
  bip125_replaceable?: Bip125Replaceable;
  details: TransactionDetail[];
  hex: string;
  decoded?: unknown;
}

/**
 * Bitcoind, a wrapper for Bitcoin Core JSON-RPC
 */
export default class Bitcoind {
  private request: AxiosInstance;

  constructor({ env, logger }: Cradle) {
    const {
      BITCOIN_JSON_RPC_USERNAME: username,
      BITCOIN_JSON_RPC_PASSWORD: password,
      BITCOIN_JSON_RPC_URL: baseURL,
    } = env;
    const credentials = `${username}:${password}`;
    const token = Buffer.from(credentials, 'utf-8').toString('base64');

    this.request = axios.create({
      baseURL,
      headers: {
        Authorization: `Basic ${token}`,
      },
    });
    addLoggerInterceptor(this.request, logger);
  }

  private async callMethod<T>(method: string, params: unknown): Promise<T> {
    return Sentry.startSpan({ op: this.constructor.name, name: method }, async () => {
      const id = randomUUID();
      const response = await this.request.post('', {
        jsonrpc: '1.0',
        id,
        method,
        params,
      });
      return response.data.result;
    });
  }

  public async checkNetwork(network: NetworkType) {
    const chainInfo = await this.getBlockchainInfo();
    switch (network) {
      case NetworkType.mainnet:
        if (chainInfo.chain !== 'main') {
          throw new Error('Bitcoin JSON-RPC is not running on mainnet');
        }
        break;
      case NetworkType.testnet:
        if (chainInfo.chain !== 'test') {
          throw new Error('Bitcoin JSON-RPC is not running on testnet');
        }
        break;
      default:
    }
  }

  // https://developer.bitcoin.org/reference/rpc/getblockchaininfo.html
  public async getBlockchainInfo() {
    return this.callMethod<ChainInfo>('getblockchaininfo', []);
  }

  // https://developer.bitcoin.org/reference/rpc/sendrawtransaction.html
  public async sendRawTransaction(txHex: string) {
    return this.callMethod<string>('sendrawtransaction', [txHex]);
  }

  // https://developer.bitcoin.org/reference/rpc/gettransaction.html
  public async getTransaction(txid: string) {
    return this.callMethod<Transaction>('gettransaction', [txid]);
  }
}
