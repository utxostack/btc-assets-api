import Bitcoind from './services/bitcoind';
import { env } from './env';
import pino from 'pino';
import ElectrsAPI from './services/electrs';
import { createContainer, InjectionMode, asValue, asClass } from 'awilix';

export interface Cradle {
  env: typeof env;
  logger: pino.BaseLogger;
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
  bitcoind: asClass(Bitcoind),
  electrs: asClass(ElectrsAPI),
});

export default container;
