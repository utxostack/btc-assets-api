import { AwilixContainer, Cradle } from '../../container';

declare module 'fastify' {
  export interface FastifyInstance extends FastifyJwtNamespace<{ namespace: 'security' }> {
    container: AwilixContainer<Cradle>;
    electrs: ElectrsAPI;
    bitcoind: Bitcoind;
    paymaster: Paymaster;
    transactionManager: TransactionManager;
  }
}
