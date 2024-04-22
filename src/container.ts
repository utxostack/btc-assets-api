import { createContainer, InjectionMode, asValue, asClass } from 'awilix';
import { Redis } from 'ioredis';
import pino from 'pino';
import { env } from './env';
import TransactionManager from './services/transaction';
import Paymaster from './services/paymaster';
import Unlocker from './services/unlocker';
import BitcoinSPV from './services/spv';
import CKB from './services/ckb';
import Bitcoin from './services/bitcoin';

export interface Cradle {
  env: typeof env;
  logger: pino.BaseLogger;
  redis: Redis;
  ckb: CKB;
  bitcoin: Bitcoin;
  bitcoinSPV: BitcoinSPV;
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
  ckb: asClass(CKB).singleton(),
  bitcoin: asClass(Bitcoin).singleton(),
  bitcoinSPV: asClass(BitcoinSPV).singleton(),
  paymaster: asClass(Paymaster).singleton(),
  transactionManager: asClass(TransactionManager).singleton(),
  unlocker: asClass(Unlocker).singleton(),
});

export default container;
