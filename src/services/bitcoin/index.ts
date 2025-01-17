/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/ban-types */
import { HttpStatusCode, isAxiosError } from 'axios';
import * as Sentry from '@sentry/node';
import { Cradle } from '../../container';
import { IBitcoinBroadcastBackuper, IBitcoinDataProvider } from './interface';
import { MempoolClient } from './mempool';
import { ElectrsClient } from './electrs';
import { IS_MAINNET, NetworkType } from '../../constants';
import { ChainInfo } from './schema';

// https://github.com/mempool/electrs/blob/d4f788fc3d7a2b4eca4c5629270e46baba7d0f19/src/errors.rs#L6
export enum BitcoinClientErrorMessage {
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
}

const BitcoinClientErrorMap = {
  [BitcoinClientErrorMessage.Connection]: BitcoinClientErrorCode.Connection,
  [BitcoinClientErrorMessage.Interrupt]: BitcoinClientErrorCode.Interrupt,
  [BitcoinClientErrorMessage.TooManyUtxos]: BitcoinClientErrorCode.TooManyUtxos,
  [BitcoinClientErrorMessage.TooManyTxs]: BitcoinClientErrorCode.TooManyTxs,
  [BitcoinClientErrorMessage.ElectrumClient]: BitcoinClientErrorCode.ElectrumClient,
};

export class BitcoinClientAPIError extends Error {
  public statusCode = HttpStatusCode.ServiceUnavailable;
  public errorCode: BitcoinClientErrorCode;

  constructor(message: string) {
    super(message);
    this.name = this.constructor.name;

    const errorKey = Object.keys(BitcoinClientErrorMap).find((msg) => message.startsWith(msg));
    this.errorCode = BitcoinClientErrorMap[errorKey as BitcoinClientErrorMessage];
  }
}

interface IBitcoinClient extends IBitcoinDataProvider {
  checkNetwork(network: NetworkType): Promise<void>;
  getBlockchainInfo(): Promise<ChainInfo>;
}

type MethodParameters<T, K extends keyof T> = T[K] extends (...args: infer P) => any ? P : never;
type MethodReturnType<T, K extends keyof T> = T[K] extends (...args: any[]) => infer R ? R : never;

export default class BitcoinClient implements IBitcoinClient {
  private cradle: Cradle;
  private source: IBitcoinDataProvider;
  private fallback?: IBitcoinDataProvider;
  private backupers: IBitcoinBroadcastBackuper[] = [];

  constructor(cradle: Cradle) {
    this.cradle = cradle;

    const { env } = cradle;
    switch (env.BITCOIN_DATA_PROVIDER) {
      case 'mempool':
        this.cradle.logger.info('Using Mempool.space API as the bitcoin data provider');
        this.source = new MempoolClient(env.BITCOIN_MEMPOOL_SPACE_API_URL, cradle);
        if (env.BITCOIN_ELECTRS_API_URL) {
          this.cradle.logger.info('Using Electrs API as the fallback bitcoin data provider');
          this.fallback = new ElectrsClient(env.BITCOIN_ELECTRS_API_URL);
        }
        break;
      case 'electrs':
        this.cradle.logger.info('Using Electrs API as the bitcoin data provider');
        this.source = new ElectrsClient(env.BITCOIN_ELECTRS_API_URL);
        if (env.BITCOIN_MEMPOOL_SPACE_API_URL) {
          this.cradle.logger.info('Using Mempool.space API as the fallback bitcoin data provider');
          this.fallback = new MempoolClient(env.BITCOIN_MEMPOOL_SPACE_API_URL, cradle);
        }
        break;
      default:
        throw new Error('Invalid bitcoin data provider');
    }

    if (this.fallback) {
      this.backupers.push(this.fallback);
    }
    if (
      env.BITCOIN_ADDITIONAL_BROADCAST_ELECTRS_URL_LIST &&
      env.BITCOIN_ADDITIONAL_BROADCAST_ELECTRS_URL_LIST.length > 0
    ) {
      const additionalElectrs = env.BITCOIN_ADDITIONAL_BROADCAST_ELECTRS_URL_LIST.map((url) => new ElectrsClient(url));
      this.backupers.push(...additionalElectrs);
    }
  }

  private async call<K extends keyof IBitcoinDataProvider>(
    method: K,
    ...args: MethodParameters<IBitcoinDataProvider, K>
  ): Promise<MethodReturnType<IBitcoinDataProvider, K>> {
    const dataSource = { source: this.source, fallback: this.fallback };

    const { env } = this.cradle;
    if (env.BITCOIN_DATA_PROVIDER === 'mempool' && env.BITCOIN_METHODS_USE_ELECTRS_BY_DEFAULT.includes(method)) {
      if (this.fallback) {
        dataSource.source = this.fallback;
        dataSource.fallback = this.source;
      } else {
        this.cradle.logger.warn('No fallback provider, skip using Electrs as default');
      }
    }

    const { source, fallback } = dataSource;
    try {
      this.cradle.logger.debug(`Calling ${method} with args: ${JSON.stringify(args)}`);
      const result = await (source[method] as Function).apply(source, args);
      return result as MethodReturnType<IBitcoinDataProvider, K>;
    } catch (err) {
      let calledError = err;
      this.cradle.logger.error(err);
      Sentry.captureException(err);
      if (fallback) {
        this.cradle.logger.warn(`Fallback to ${fallback.constructor.name} due to error: ${(err as Error).message}`);
        try {
          const result = await (fallback[method] as Function).apply(fallback, args);
          return result as MethodReturnType<IBitcoinDataProvider, K>;
        } catch (fallbackError) {
          this.cradle.logger.error(fallbackError);
          Sentry.captureException(fallbackError);
          calledError = fallbackError;
        }
      }
      if (isAxiosError(calledError)) {
        const error = new BitcoinClientAPIError(calledError.response?.data ?? calledError.message);
        if (calledError.response?.status) {
          error.statusCode = calledError.response.status;
        }
        throw error;
      }
      throw err;
    }
  }

  public async getBaseURL(): Promise<string> {
    return this.source.getBaseURL();
  }

  public async checkNetwork(network: NetworkType) {
    const hash = await this.getBlockHeight({ height: 0 });
    switch (network) {
      case NetworkType.mainnet:
        // Bitcoin mainnet genesis block hash
        if (hash !== '000000000019d6689c085ae165831e934ff763ae46a2a6c172b3f1b60a8ce26f') {
          throw new Error('Bitcoin client is not running on mainnet');
        }
        break;
      case NetworkType.testnet:
        // Bitcoin testnet genesis block hash
        if (hash !== '000000000933ea01ad0ee984209779baaec3ced90fa3f408719526f8d77f4943') {
          throw new Error('Bitcoin client is not running on testnet');
        }
        break;
      case NetworkType.signet:
        // Bitcoin signet genesis block hash
        if (hash !== '00000008819873e925422c1ff0f99f7cc9bbb232af63a077a480a3633bee1ef6') {
          throw new Error('Bitcoin client is not running on signet');
        }
        break;
      default:
    }
  }

  public async getBlockchainInfo(): Promise<ChainInfo> {
    const hash = await this.getBlocksTipHash();
    const tip = await this.getBlock({ hash });

    const { difficulty, mediantime } = tip;
    return {
      chain: IS_MAINNET ? 'main' : 'test',
      blocks: tip.height,
      bestblockhash: hash,
      difficulty,
      mediantime,
    };
  }

  public async getFeesRecommended() {
    return this.call('getFeesRecommended');
  }

  public async postTx({ txhex }: { txhex: string }) {
    const txid = await this.call('postTx', { txhex });
    Promise.allSettled(
      this.backupers.map(async (backuper) => {
        const baseURL = await backuper.getBaseURL();
        try {
          await backuper.postTx({ txhex });
        } catch (err) {
          Sentry.withScope((scope) => {
            scope.setTag('bitcoin.baseURL', baseURL);
            scope.captureException(err);
          });
        }
      }),
    );
    return txid;
  }

  public async getAddressTxsUtxo({ address }: { address: string }) {
    return this.call('getAddressTxsUtxo', { address });
  }

  public async getAddressTxs({ address, after_txid }: { address: string; after_txid?: string }) {
    return this.call('getAddressTxs', { address, after_txid });
  }

  public async getTx({ txid }: { txid: string }) {
    return this.call('getTx', { txid });
  }

  public async getTxHex({ txid }: { txid: string }) {
    return this.call('getTxHex', { txid });
  }

  public async getBlock({ hash }: { hash: string }) {
    return this.call('getBlock', { hash });
  }

  public async getBlockHeight({ height }: { height: number }) {
    return this.call('getBlockHeight', { height });
  }

  public async getBlockHeader({ hash }: { hash: string }) {
    return this.call('getBlockHeader', { hash });
  }

  public async getBlockTxids({ hash }: { hash: string }) {
    return this.call('getBlockTxids', { hash });
  }

  public async getBlocksTipHash() {
    return this.call('getBlocksTipHash');
  }
}
