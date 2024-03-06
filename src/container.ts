import { createContainer, InjectionMode, asValue, asClass, Lifetime } from 'awilix';
import { Redis } from 'ioredis';
import pino from 'pino';
import Bitcoind from './services/bitcoind';
import ElectrsAPI from './services/electrs';
import { env } from './env';
import TransactionQueue from './services/transaction-queue';

export interface Cradle {
  env: typeof env;
  logger: pino.BaseLogger;
  redis: Redis;
  bitcoind: Bitcoind;
  electrs: ElectrsAPI;
  transactionQueue: TransactionQueue;
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
  transactionQueue: asClass(TransactionQueue, { lifetime: Lifetime.SINGLETON }),
});

export default container;
