/* eslint-disable @typescript-eslint/no-unused-vars */

import fastify from 'fastify';
import { AwilixContainer, Cradle } from '../../container';
import Bitcoind from '../../services/bitcoind';
import ElectrsAPI from '../../services/electrs';
import TransactionQueue from '../../services/transaction-queue';

declare module 'fastify' {
  export interface FastifyInstance<HttpServer = Server, HttpRequest = IncomingMessage, HttpResponse = ServerResponse>
    extends FastifyJwtNamespace<{ namespace: 'security' }> {
    container: AwilixContainer<Cradle>;
    electrs: ElectrsAPI;
    bitcoind: Bitcoind;
    transactionQueue: TransactionQueue;
  }
}
