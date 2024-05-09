import { createContainer, InjectionMode, asValue, asClass } from 'awilix';
import { Redis } from 'ioredis';
import pino from 'pino';
import { env } from './env';
import TransactionProcessor from './services/transaction';
import Paymaster from './services/paymaster';
import Unlocker from './services/unlocker';
import SPVClient from './services/spv';
import CKBClient from './services/ckb';
import BitcoinClient from './services/bitcoin';
import RgbppCollector from './services/rgbpp';
import UTXOSyncer from './services/utxo';

export interface Cradle {
  env: typeof env;
  logger: pino.BaseLogger;
  redis: Redis;
  ckb: CKBClient;
  bitcoin: BitcoinClient;
  spv: SPVClient;
  paymaster: Paymaster;
  unlocker: Unlocker;
  transactionProcessor: TransactionProcessor;
  rgbppCollector: RgbppCollector;
  utxoSyncer: UTXOSyncer;
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
  ckb: asClass(CKBClient).singleton(),
  bitcoin: asClass(BitcoinClient).singleton(),
  spv: asClass(SPVClient).singleton(),
  paymaster: asClass(Paymaster).singleton(),
  transactionProcessor: asClass(TransactionProcessor).singleton(),
  unlocker: asClass(Unlocker).singleton(),
  rgbppCollector: asClass(RgbppCollector).singleton(),
  utxoSyncer: asClass(UTXOSyncer).singleton(),
});

export default container;
