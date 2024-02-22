import axios, { AxiosInstance } from 'axios';

export interface DescriptorInfo {
  descriptor: string;
  checksum: string;
  isrange: boolean;
  issolvable: boolean;
  hasprivatekeys: boolean;
}

export interface Unspent {
  txid: string;
  vout: number;
  address: string;
  label: string;
  scriptPubKey: string;
  amount: number;
  confirmations: number;
  redeemScript: string;
  spendable: boolean;
  solvable: boolean;
  safe: boolean;
}

export interface AddressInfo {
  address: string;
  scriptPubKey: string;
  ismine: boolean;
  iswatchonly: boolean;
  solvable: boolean;
  desc: string;
  isscript: boolean;
  iswitness: boolean;
  witness_version: number;
  witness_program: string;
  script: string;
  hex: string;
  pubkeys: string[];
  sigsrequired: number;
  pubkey: string;
  iscompressed: boolean;
  ischange: boolean;
  timestamp: number;
  hdkeypath: string;
  hdmasterkeyid: string;
}

export default class Bitcoind {
  private request: AxiosInstance;

  constructor(baseURL: string, username: string, password: string) {
    const credentials = `${username}:${password}`;
    const token = Buffer.from(credentials, 'utf-8').toString('base64');
    this.request = axios.create({
      baseURL,
      headers: {
        Authorization: `Basic ${token}`,
      },
    });
  }

  private async callMethod<T>(method: string, params: unknown): Promise<T> {
    const response = await this.request.post('', {
      jsonrpc: '1.0',
      id: Date.now(),
      method,
      params,
    });
    return response.data.result;
  }

  // https://developer.bitcoin.org/reference/rpc/getdescriptorinfo.html
  public async getDescriptorInfo(descriptor: string) {
    return this.callMethod<DescriptorInfo>('getdescriptorinfo', [descriptor]);
  }

  // https://developer.bitcoin.org/reference/rpc/importdescriptors.html
  public async importDescriptors(descriptors: DescriptorInfo[]) {
    return this.callMethod<void>('importdescriptors', [
      descriptors.map((d) => ({
        desc: d.descriptor,
        timestamp: 'now',
        watchonly: true,
      })),
    ]);
  }

  // https://developer.bitcoin.org/reference/rpc/getaddressinfo.html
  public async getAddressInfo(address: string) {
    return this.callMethod<AddressInfo>('getaddressinfo', [address]);
  }

  // https://developer.bitcoin.org/reference/rpc/listunspent.html
  public async listUnspent(address: string) {
    return this.callMethod<void>('listunspent', [0, 9999999, [address]]);
  }
}
