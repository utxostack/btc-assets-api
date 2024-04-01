import { ChainInfo } from '../routes/bitcoin/types';
import axios, { AxiosError, AxiosInstance } from 'axios';
import * as Sentry from '@sentry/node';
import { addLoggerInterceptor } from '../utils/interceptors';
import { Cradle } from '../container';
import { NetworkType } from '../constants';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';

// https://github.com/bitcoin/bitcoin/blob/26.x/src/rpc/protocol.h#L23
export enum RPCErrorCode {
  RPC_MISC_ERROR = -1,
  RPC_TYPE_ERROR = -3,
  RPC_INVALID_ADDRESS_OR_KEY = -5,
  RPC_OUT_OF_MEMORY = -7,
  RPC_INVALID_PARAMETER = -8,
  RPC_DATABASE_ERROR = -20,
  RPC_DESERIALIZATION_ERROR = -22,
  RPC_VERIFY_ERROR = -25,
  RPC_VERIFY_REJECTED = -26,
  RPC_VERIFY_ALREADY_IN_CHAIN = -27,
  RPC_IN_WARMUP = -28,
  RPC_METHOD_DEPRECATED = -32,
}

export class BitcoinRPCError extends Error {
  public statusCode: number;
  public errorCode: RPCErrorCode;

  public static schema = z.object({
    code: z.number(),
    message: z.string(),
  });

  constructor(statusCode: number, code: RPCErrorCode, message: string) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.errorCode = code;
  }
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
      try {
        const id = randomUUID();
        const response = await this.request.post('', {
          jsonrpc: '1.0',
          id,
          method,
          params,
        });
        return response.data.result;
      } catch (err) {
        if (err instanceof AxiosError && err.response?.data.error) {
          const { code, message } = BitcoinRPCError.schema.parse(err.response.data.error);
          throw new BitcoinRPCError(err.response.status, code, message);
        }
        throw err;
      }
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
}
