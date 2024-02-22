import axios, { AxiosInstance } from 'axios';

export interface UTXO {
  txid: string;
  vout: number;
  value: number;
  status: {
    confirmed: boolean;
    block_height: number;
    block_hash: string;
    block_time: number;
  };
}

export interface Balance {
  address: string;
  satoshi: number;
  pendingSatoshi: number;
  utxoCount: number;
}

export default class ElectrsAPI {
  private request: AxiosInstance;

  constructor(baseURL: string) {
    this.request = axios.create({
      baseURL,
    });
  }

  async getUtxoByAddress(address: string): Promise<UTXO[]> {
    const response = await this.request.get(`/address/${address}/utxo`);
    return response.data;
  }

  async getBalanceByAddress(address: string): Promise<Balance> {
    const utxos = await this.getUtxoByAddress(address);
    return utxos.reduce(
      (acc, utxo) => {
        if (utxo.status.confirmed) {
          acc.satoshi += utxo.value;
        } else {
          acc.pendingSatoshi += utxo.value;
        }
        return acc;
      },
      {
        address,
        satoshi: 0,
        pendingSatoshi: 0,
        utxoCount: utxos.length,
      },
    );
  }
}
