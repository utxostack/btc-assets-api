import { Block, RecommendedFees, Transaction, UTXO } from './schema';

export interface IBitcoinDataProvider {
  getBaseURL(): Promise<string>;
  getFeesRecommended(): Promise<RecommendedFees>;
  postTx({ txhex }: { txhex: string }): Promise<string>;
  getAddressTxsUtxo({ address }: { address: string }): Promise<UTXO[]>;
  getAddressTxs({ address, after_txid }: { address: string; after_txid?: string }): Promise<Transaction[]>;
  getTx({ txid }: { txid: string }): Promise<Transaction>;
  getTxHex({ txid }: { txid: string }): Promise<string>;
  getBlock({ hash }: { hash: string }): Promise<Block>;
  getBlockHeight({ height }: { height: number }): Promise<string>;
  getBlockHeader({ hash }: { hash: string }): Promise<string>;
  getBlockTxids({ hash }: { hash: string }): Promise<string[]>;
  getBlocksTipHash(): Promise<string>;
}

export type IBitcoinBroadcastBackuper = Pick<IBitcoinDataProvider, 'getBaseURL' | 'postTx'>;
