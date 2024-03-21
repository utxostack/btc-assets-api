import { createContainer, InjectionMode, asValue, asClass, asFunction } from 'awilix';
import { Redis } from 'ioredis';
import pino from 'pino';
import Bitcoind from './services/bitcoind';
import ElectrsAPI from './services/electrs';
import { env } from './env';
import TransactionManager from './services/transaction';
import Paymaster from './services/paymaster';
import { RPC as CkbRPC, Indexer as CkbIndexer } from '@ckb-lumos/lumos';
import Unlocker from './services/unlocker';

export interface Cradle {
  env: typeof env;
  logger: pino.BaseLogger;
  redis: Redis;
  ckbRpc: CkbRPC;
  ckbIndexer: CkbIndexer;
  bitcoind: Bitcoind;
  electrs: ElectrsAPI;
  paymaster: Paymaster;
  unlocker: Unlocker;
  transactionManager: TransactionManager;
}

const container = createContainer<Cradle>({
  injectionMode: InjectionMode.PROXY,
  strict: true,
});

container.register({
  env: asValue(env),
  logger: asValue(pino()),
  redis: asValue(
    new Redis(env.REDIS_URL, {
      maxRetriesPerRequest: null,
    }),
  ),
  ckbRpc: asFunction(() => new CkbRPC(env.CKB_RPC_URL)).singleton(),
  ckbIndexer: asFunction(() => new CkbIndexer(env.CKB_INDEXER_URL)).singleton(),
  bitcoind: asClass(Bitcoind).singleton(),
  electrs: asClass(ElectrsAPI).singleton(),
  paymaster: asClass(Paymaster).singleton(),
  transactionManager: asClass(TransactionManager).singleton(),
  unlocker: asClass(Unlocker).singleton(),
});

export default container;
