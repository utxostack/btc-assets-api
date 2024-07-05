import { BlockDto, RecommendedFeesDto, TransactionDto, UTXODto } from '../bitcoin.schema';

export interface IBitcoinDataProvider {
  getBaseURL(): Promise<string>;
  getFeesRecommended(): Promise<RecommendedFeesDto>;
  postTx({ txhex }: { txhex: string }): Promise<string>;
  getAddressTxsUtxo({ address }: { address: string }): Promise<UTXODto[]>;
  getAddressTxs({
    address,
    after_txid,
  }: {
    address: string;
    after_txid?: string;
  }): Promise<TransactionDto[]>;
  getTx({ txid }: { txid: string }): Promise<TransactionDto>;
  getTxHex({ txid }: { txid: string }): Promise<string>;
  getBlock({ hash }: { hash: string }): Promise<BlockDto>;
  getBlockHeight({ height }: { height: number }): Promise<string>;
  getBlockHeader({ hash }: { hash: string }): Promise<string>;
  getBlockTxids({ hash }: { hash: string }): Promise<string[]>;
  getBlocksTipHash(): Promise<string>;
}

export type IBitcoinBroadcastBackuper = Pick<IBitcoinDataProvider, 'getBaseURL' | 'postTx'>;
