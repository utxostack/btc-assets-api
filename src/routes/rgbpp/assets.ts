import { FastifyPluginCallback } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import { Server } from 'http';
import z from 'zod';
import { Cell, Script, SporeTypeInfo, XUDTTypeInfo } from './types';
import { UTXO } from '../../services/bitcoin/schema';
import { getTypeScript } from '../../utils/typescript';
import { IndexerCell, isSporeTypeSupported, isUDTTypeSupported } from '@rgbpp-sdk/ckb';
import { computeScriptHash } from '@ckb-lumos/lumos/utils';
import { getSporeConfig, unpackToRawClusterData, unpackToRawSporeData } from '../../utils/spore';
import { SearchKey } from '../../services/rgbpp';
import { IS_MAINNET } from '../../constants';

const assetsRoute: FastifyPluginCallback<Record<never, never>, Server, ZodTypeProvider> = (fastify, _, done) => {
  fastify.get(
    '/:btc_txid',
    {
      schema: {
        description: `Get RGB++ assets by BTC txid.`,
        tags: ['RGB++'],
        params: z.object({
          btc_txid: z.string().length(64, 'Should be a 64-character hex string'),
        }),
        response: {
          200: z.array(
            Cell.merge(
              z.object({
                typeHash: z.string().optional(),
              }),
            ),
          ),
        },
      },
    },
    async (request) => {
      const { btc_txid } = request.params;
      const transaction = await fastify.bitcoin.getTx({ txid: btc_txid });

      const utxos = transaction.vout.map((vout, index) => {
        return {
          txid: btc_txid,
          vout: index,
          value: vout.value,
          status: {
            confirmed: true,
          },
        } as UTXO;
      });

      const batchCells = await fastify.rgbppCollector.getRgbppCellsByBatchRequest(utxos);
      return batchCells.flat().map((cell) => {
        const typeHash = cell.cellOutput.type ? computeScriptHash(cell.cellOutput.type) : undefined;
        return {
          ...cell,
          typeHash,
        };
      });
    },
  );

  fastify.get(
    '/:btc_txid/:vout',
    {
      schema: {
        description: 'Get RGB++ assets by btc txid and vout',
        tags: ['RGB++'],
        params: z.object({
          btc_txid: z.string().length(64, 'should be a 64-character hex string'),
          vout: z.string().min(1, 'cannot be empty').pipe(z.coerce.number().min(0, 'cannot be negative')),
        }),
        response: {
          200: z.array(
            Cell.merge(
              z.object({
                typeHash: z.string().optional(),
              }),
            ),
          ),
        },
      },
    },
    async (request) => {
      const { btc_txid, vout } = request.params;
      const utxo: UTXO = {
        txid: btc_txid,
        vout,
        // We don't need the value here, so we just set it to 0
        value: 0,
        status: {
          confirmed: true,
        },
      };

      const batchCells = await fastify.rgbppCollector.getRgbppCellsByBatchRequest([utxo]);
      return batchCells.flat().map((cell) => {
        const typeHash = cell.cellOutput.type ? computeScriptHash(cell.cellOutput.type) : undefined;
        return {
          ...cell,
          typeHash,
        };
      });
    },
  );

  fastify.get(
    '/type',
    {
      schema: {
        description: 'Get RGB++ assets type info by typescript',
        tags: ['RGB++@Unstable'],
        querystring: z.object({
          type_script: Script.or(z.string())
            .optional()
            .describe(
              `
              type script to filter cells

              two ways to provide:
              - as a object: 'encodeURIComponent(JSON.stringify({"codeHash":"0x...", "args":"0x...", "hashType":"type"}))'
              - as a hex string: '0x...' (You can pack by @ckb-lumos/codec blockchain.Script.pack({ "codeHash": "0x...", ... }))
            `,
            ),
        }),
        response: {
          200: z
            .union([
              z
                .object({
                  type: z.literal('xudt'),
                })
                .merge(XUDTTypeInfo),
              z
                .object({
                  type: z.literal('spore'),
                })
                .merge(SporeTypeInfo),
            ])
            .nullable(),
        },
      },
    },
    async (request) => {
      const typeScript = getTypeScript(request.query.type_script);
      if (!typeScript) {
        return null;
      }
      if (isUDTTypeSupported(typeScript, IS_MAINNET)) {
        const infoCell = await fastify.ckb.getInfoCellData(typeScript);
        const typeHash = computeScriptHash(typeScript);
        if (!infoCell) {
          return null;
        }
        return {
          type: 'xudt' as const,
          type_hash: typeHash,
          type_script: typeScript,
          ...infoCell,
        };
      }
      if (isSporeTypeSupported(typeScript, IS_MAINNET)) {
        const searchKey: SearchKey = {
          script: typeScript,
          scriptType: 'type',
          withData: true,
        };
        const result = await fastify.ckb.rpc.getCells(searchKey, 'desc', '0x1');
        const [sporeCell] = result.objects;
        const sporeData = unpackToRawSporeData(sporeCell.outputData!);
        const sporeInfo: SporeTypeInfo = {
          contentType: sporeData.contentType,
        };
        if (sporeData.clusterId) {
          const sporeConfig = getSporeConfig(IS_MAINNET);
          const batchRequest = fastify.ckb.rpc.createBatchRequest(
            sporeConfig.scripts.Cluster.versions.map((version) => {
              const clusterScript = {
                ...version.script,
                args: sporeData.clusterId!,
              };
              const searchKey: SearchKey = {
                script: clusterScript,
                scriptType: 'type',
                withData: true,
              };
              return ['getCells', searchKey, 'desc', '0x1'];
            }),
          );
          const cells = await batchRequest.exec();
          const [cell] = cells.map(({ objects }: { objects: IndexerCell[] }) => objects).flat();
          const clusterData = unpackToRawClusterData(cell.outputData!);
          sporeInfo.cluster = {
            id: sporeData.clusterId,
            name: clusterData.name,
            description: clusterData.description,
          };
        }
        return {
          type: 'spore' as const,
          ...sporeInfo,
        };
      }
      return null;
    },
  );

  done();
};

export default assetsRoute;
