import { IBitcoinDataProvider } from './bitcoin-data-provider.interface';

export type IBitcoinBroadcastBackuper = Pick<IBitcoinDataProvider, 'getBaseURL' | 'postTx'>;
