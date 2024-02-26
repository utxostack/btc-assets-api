/* eslint-disable @typescript-eslint/no-unused-vars */

import fastify from 'fastify';
import { Bitcoind } from '../../src/lib/bitcoind';

declare module 'fastify' {
  export interface FastifyInstance<
    HttpServer = Server,
    HttpRequest = IncomingMessage,
    HttpResponse = ServerResponse,
  > extends FastifyJwtNamespace<{ namespace: 'security' }> {
    authenticate: FastifyMiddleware;
    electrs: ElectrsAPI;
    bitcoind: Bitcoind;
  }
}
