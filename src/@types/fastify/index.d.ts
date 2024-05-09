import { AwilixContainer, Cradle } from '../../container';
import TransactionProcessor from '../../services/transaction';
import Paymaster from '../../services/paymaster';
import SPVClient from '../../services/spv';
import CKBClient from '../../services/ckb';
import BitcoinClient from '../../services/bitcoin';
import RgbppCollector from '../../services/rgbpp';

declare module 'fastify' {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  export interface FastifyInstance<HttpServer = Server, HttpRequest = IncomingMessage, HttpResponse = ServerResponse>
    extends FastifyJwtNamespace<{ namespace: 'security' }> {
    container: AwilixContainer<Cradle>;
    ckb: CKBClient;
    bitcoin: BitcoinClient;
    spv: SPVClient;
    paymaster: Paymaster;
    transactionProcessor: TransactionProcessor;
    rgbppCollector: RgbppCollector;
  }
}
