import process from 'node:process';
import fastify from 'fastify';
import options from './options';
import { env } from './env';
import { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';

const port = parseInt(env.PORT || '3000', 10);

const app = fastify(options).withTypeProvider<TypeBoxTypeProvider>()

app.register(import('./app'));

app.listen({ port }, (err, address) => {
  if (err) {
    console.error(err);
    process.exit(1);
  }
  // eslint-disable-next-line no-console
  console.log(`Server listening at ${address}`);
});
