import * as dotenv from 'dotenv';
dotenv.config();

import Fastify from 'fastify';

const app = Fastify({
  logger: true,
});

app.register(import('../src/app'));

export default async (req: Request, res: Response) => {
  await app.ready();
  app.server.emit('request', req, res);
};
