import { AwilixContainer, Cradle } from '../../container';
import TransactionManager from '../../services/transaction';
import Paymaster from '../../services/paymaster';
import SPV from '../../services/spv';
import CKB from '../../services/ckb';
import Bitcoin from '../../services/bitcoin';

declare module 'fastify' {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  export interface FastifyInstance<HttpServer = Server, HttpRequest = IncomingMessage, HttpResponse = ServerResponse>
    extends FastifyJwtNamespace<{ namespace: 'security' }> {
    container: AwilixContainer<Cradle>;
    ckb: CKB;
    bitcoin: Bitcoin;
    spv: SPV;
    paymaster: Paymaster;
    transactionManager: TransactionManager;
  }
}
