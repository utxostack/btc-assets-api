import { createContainer, InjectionMode, asValue, asClass, Lifetime } from 'awilix';
import { Redis } from 'ioredis';
import pino from 'pino';
import Bitcoind from './services/bitcoind';
import ElectrsAPI from './services/electrs';
import { env } from './env';
import TransactionManager from './services/transaction';
import Paymaster from './services/paymaster';

export interface Cradle {
  env: typeof env;
  logger: pino.BaseLogger;
  redis: Redis;
  bitcoind: Bitcoind;
  electrs: ElectrsAPI;
  paymaster: Paymaster;
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
  bitcoind: asClass(Bitcoind, { lifetime: Lifetime.SINGLETON }),
  electrs: asClass(ElectrsAPI, { lifetime: Lifetime.SINGLETON }),
  paymaster: asClass(Paymaster, { lifetime: Lifetime.SINGLETON }),
  transactionManager: asClass(TransactionManager, { lifetime: Lifetime.SINGLETON }),
});

export default container;
