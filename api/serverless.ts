import * as dotenv from 'dotenv';
dotenv.config();

import fastify from 'fastify';
import options from '../src/options';
import { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';

const app = fastify(options).withTypeProvider<TypeBoxTypeProvider>();

app.register(import('../src/app'));

export default async (req: Request, res: Response) => {
  await app.ready();
  app.server.emit('request', req, res);
};
