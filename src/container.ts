import { createContainer, InjectionMode, asValue, asClass, asFunction } from 'awilix';
import { Redis } from 'ioredis';
import pino from 'pino';
import Bitcoind from './services/bitcoind';
import ElectrsAPI from './services/electrs';
import { env } from './env';

export interface Cradle {
  env: typeof env;
  logger: pino.BaseLogger;
  redis: Redis | undefined;
  bitcoind: Bitcoind;
  electrs: ElectrsAPI;
}

const container = createContainer<Cradle>({
  injectionMode: InjectionMode.PROXY,
  strict: true,
});

container.register({
  env: asValue(env),
  logger: asValue(pino()),
  redis: asFunction(() => env.REDIS_URL ? new Redis(env.REDIS_URL) : undefined),
  bitcoind: asClass(Bitcoind),
  electrs: asClass(ElectrsAPI),
});

export default container;
