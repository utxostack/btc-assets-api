import { AwilixContainer, Cradle } from '../../container';
import Bitcoind from '../../services/bitcoind';
import ElectrsAPI from '../../services/electrs';
import TransactionManager from '../../services/transaction';
import Paymaster from '../../services/paymaster';
import BitcoinSPV from '../../services/spv';
import { Indexer, RPC } from '@ckb-lumos/lumos';

declare module 'fastify' {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  export interface FastifyInstance<HttpServer = Server, HttpRequest = IncomingMessage, HttpResponse = ServerResponse>
    extends FastifyJwtNamespace<{ namespace: 'security' }> {
    container: AwilixContainer<Cradle>;
    ckbRPC: RPC;
    ckbIndexer: Indexer;
    electrs: ElectrsAPI;
    bitcoind: Bitcoind;
    bitcoinSPV: BitcoinSPV;
    paymaster: Paymaster;
    transactionManager: TransactionManager;
  }
}
