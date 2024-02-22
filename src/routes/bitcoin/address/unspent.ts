import { Type, TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import { FastifyPluginCallback } from 'fastify';
import { Server } from 'http';

const unspentRoute: FastifyPluginCallback<Record<never, never>, Server, TypeBoxTypeProvider> = (
  fastify,
  _,
  done,
) => {
  fastify.get(
    '/unspent',
    {
      schema: {
        params: Type.Object({
          address: Type.String(),
        }),
        response: {
          200: Type.Array(
            Type.Object({
              txid: Type.String(),
              vout: Type.Number(),
              value: Type.Number(),
              status: Type.Object({
                confirmed: Type.Boolean(),
                block_height: Type.Number(),
                block_hash: Type.String(),
                block_time: Type.Number(),
              }),
            }),
          ),
        },
      },
    },
    async function (request) {
      const { address } = request.params;
      const utxos = await fastify.electrs.getUtxoByAddress(address);
      return utxos;
    },
  );
  done();
};

export default unspentRoute;
