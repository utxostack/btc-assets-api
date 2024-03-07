import { AwilixContainer, Cradle } from '../../container';
import Bitcoind from '../../services/bitcoind';
import ElectrsAPI from '../../services/electrs';
import TransactionManager from '../../services/transaction-manager';
import Paymaster from '../../services/paymaster';

declare module 'fastify' {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  export interface FastifyInstance<HttpServer = Server, HttpRequest = IncomingMessage, HttpResponse = ServerResponse>
    extends FastifyJwtNamespace<{ namespace: 'security' }> {
    container: AwilixContainer<Cradle>;
    electrs: ElectrsAPI;
    bitcoind: Bitcoind;
    paymaster: Paymaster;
    transactionManager: TransactionManager;
  }
}
