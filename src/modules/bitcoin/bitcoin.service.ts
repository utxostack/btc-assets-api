import { Injectable, Logger } from '@nestjs/common';
import { IBitcoinBroadcastBackuper, IBitcoinDataProvider } from './clients/interface';
import { ConfigService } from '@nestjs/config';
import { MempoolClient } from './clients/mempool.client';
import { ElectrsClient } from './clients/electrs.client';
import { HttpStatusCode, isAxiosError } from 'axios';
import { NetworkType } from 'src/constants';
import { InjectSentry, SentryService } from '@ntegral/nestjs-sentry';
import { BlockchainInfoDto } from './bitcoin.schema';

type MethodParameters<T, K extends keyof T> = T[K] extends (...args: infer P) => any ? P : never;
type MethodReturnType<T, K extends keyof T> = T[K] extends (...args: any[]) => infer R ? R : never;

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

export class BitcoinServiceError extends Error {
  public statusCode = HttpStatusCode.ServiceUnavailable;
  public errorCode: BitcoinClientErrorCode;

  constructor(message: string) {
    super(message);
    this.name = this.constructor.name;

    const errorKey = Object.keys(BitcoinClientErrorMap).find((msg) => message.startsWith(msg));
    this.errorCode = BitcoinClientErrorMap[errorKey as BitcoinClientErrorMessage];
  }
}

@Injectable()
export class BitcoinService {
  private logger = new Logger(BitcoinService.name);
  private source: IBitcoinDataProvider;
  private fallback?: IBitcoinDataProvider;
  private backupers: IBitcoinBroadcastBackuper[] = [];

  constructor(
    private configService: ConfigService,
    @InjectSentry() private readonly sentryService: SentryService,
  ) {
    const BITCOIN_DATA_PROVIDER = this.configService.get('BITCOIN_DATA_PROVIDER');
    const BITCOIN_ELECTRS_API_URL = this.configService.get('BITCOIN_ELECTRS_API_URL');
    const BITCOIN_MEMPOOL_SPACE_API_URL = this.configService.get('BITCOIN_MEMPOOL_SPACE_API_URL');
    const network = this.configService.get('NETWORK');

    switch (BITCOIN_DATA_PROVIDER) {
      case 'mempool':
        this.logger.log('Using Mempool.space API as the bitcoin data provider');
        this.source = new MempoolClient(BITCOIN_MEMPOOL_SPACE_API_URL, network);
        if (BITCOIN_ELECTRS_API_URL) {
          this.logger.log('Using Electrs API as the fallback bitcoin data provider');
          this.fallback = new ElectrsClient(BITCOIN_ELECTRS_API_URL);
        }
        break;
      case 'electrs':
        this.logger.log('Using Electrs API as the bitcoin data provider');
        this.source = new ElectrsClient(BITCOIN_ELECTRS_API_URL);
        if (BITCOIN_MEMPOOL_SPACE_API_URL) {
          this.logger.log('Using Mempool.space API as the fallback bitcoin data provider');
          this.fallback = new MempoolClient(BITCOIN_MEMPOOL_SPACE_API_URL, network);
        }
        break;
      default:
        throw new Error('Invalid bitcoin data provider');
    }

    if (this.fallback) {
      this.backupers.push(this.fallback);
    }
    const additionalElectrsUrlList = this.configService.get(
      'BITCOIN_ADDITIONAL_BROADCAST_ELECTRS_URL_LIST',
    );
    if (
      additionalElectrsUrlList &&
      Array.isArray(additionalElectrsUrlList) &&
      additionalElectrsUrlList.length > 0
    ) {
      const additionalElectrs = additionalElectrsUrlList.map((url) => new ElectrsClient(url));
      this.backupers.push(...additionalElectrs);
    }
  }

  private async call<K extends keyof IBitcoinDataProvider>(
    method: K,
    ...args: MethodParameters<IBitcoinDataProvider, K>
  ): Promise<MethodReturnType<IBitcoinDataProvider, K>> {
    try {
      this.logger.debug(`Calling ${method} with args: ${JSON.stringify(args)}`);
      // eslint-disable-next-line @typescript-eslint/ban-types
      const result = await (this.source[method] as Function).apply(this.source, args);
      return result as MethodReturnType<IBitcoinDataProvider, K>;
    } catch (err) {
      let calledError = err;
      this.logger.error(err);
      this.sentryService.instance().captureException(err);
      if (this.fallback) {
        this.logger.warn(
          `Fallback to ${this.fallback.constructor.name} due to error: ${(err as Error).message}`,
        );
        try {
          // eslint-disable-next-line @typescript-eslint/ban-types
          const result = await (this.fallback[method] as Function).apply(this.fallback, args);
          return result as MethodReturnType<IBitcoinDataProvider, K>;
        } catch (fallbackError) {
          this.logger.error(fallbackError);
          this.sentryService.instance().captureException(fallbackError);
          calledError = fallbackError;
        }
      }
      if (isAxiosError(calledError)) {
        const error = new BitcoinServiceError(calledError.response?.data ?? calledError.message);
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

  public async getBlockchainInfo(): Promise<BlockchainInfoDto> {
    const hash = await this.getBlocksTipHash();
    const tip = await this.getBlock({ hash });

    const { difficulty, mediantime } = tip;
    const network = this.configService.get('NETWORK');
    return {
      chain: network === 'mainnet' ? 'main' : 'test',
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
          this.sentryService.instance().withScope((scope) => {
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
