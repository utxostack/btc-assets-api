import { AwilixContainer, Cradle } from '../../container';
import Bitcoind from '../../services/bitcoind';
import ElectrsAPI from '../../services/electrs';
import TransactionManager from '../../services/transaction';
import Paymaster from '../../services/paymaster';
import { RPC } from '@ckb-lumos/lumos';

declare module 'fastify' {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  export interface FastifyInstance<HttpServer = Server, HttpRequest = IncomingMessage, HttpResponse = ServerResponse>
    extends FastifyJwtNamespace<{ namespace: 'security' }> {
    container: AwilixContainer<Cradle>;
    ckbRPC: RPC;
    electrs: ElectrsAPI;
    bitcoind: Bitcoind;
    paymaster: Paymaster;
    transactionManager: TransactionManager;
  }
}
