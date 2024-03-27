import { FastifyPluginCallback } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import { Server } from 'http';
import z from 'zod';
import { CKBVirtualResult } from './types';
import { Job } from 'bullmq';
import {
  btcTxIdFromBtcTimeLockArgs,
  buildRgbppLockArgs,
  genRgbppLockScript,
  getBtcTimeLockScript,
} from '@rgbpp-sdk/ckb';
import { remove0x } from '@rgbpp-sdk/btc';

const transactionRoute: FastifyPluginCallback<Record<never, never>, Server, ZodTypeProvider> = (fastify, _, done) => {
  fastify.post(
    '/ckb-tx',
    {
      schema: {
        description: 'Submit a RGB++ CKB transaction',
        tags: ['RGB++'],
        body: z.object({
          btc_txid: z.string(),
          ckb_virtual_result: CKBVirtualResult,
        }),
        response: {
          200: z.object({
            state: z.string().describe('The state of the transaction, waiting by default'),
          }),
        },
      },
    },
    async (request, reply) => {
      const { btc_txid, ckb_virtual_result } = request.body;
      const job: Job = await fastify.transactionManager.enqueueTransaction({
        txid: btc_txid,
        ckbVirtualResult: ckb_virtual_result,
      });
      const state = await job.getState();
      reply.send({ state });
    },
  );

  fastify.get(
    '/:btc_txid',
    {
      schema: {
        description: `Get the CKB transaction hash by BTC txid.`,
        tags: ['RGB++'],
        params: z.object({
          btc_txid: z.string(),
        }),
        response: {
          200: z.object({
            txhash: z.string().describe('The CKB transaction hash'),
          }),
        },
      },
    },
    async (request, reply) => {
      const { btc_txid } = request.params;
      const isMainnet = process.env.NETWORK === 'mainnet';
      const transaction = await fastify.electrs.getTransaction(btc_txid);
      // query CKB transaction hash by RGBPP_LOCK cells
      for (let index = 0; index < transaction.vout.length; index++) {
        const args = buildRgbppLockArgs(index, btc_txid);
        const collector = fastify.ckbIndexer
          .collector({
            lock: genRgbppLockScript(args, isMainnet),
          })
          .collect();
        for await (const cell of collector) {
          if (cell) {
            return { txhash: cell.outPoint!.txHash };
          }
        }
      }

      // query CKB transaction hash by BTC_TIME_LOCK cells
      const btcTimeLockScript = getBtcTimeLockScript(isMainnet);
      const timeLockCollector = fastify.ckbIndexer
        .collector({
          lock: {
            codeHash: btcTimeLockScript.codeHash,
            hashType: btcTimeLockScript.hashType,
            args: '0x',
          },
        })
        .collect();
      for await (const cell of timeLockCollector) {
        const btcTxid = btcTxIdFromBtcTimeLockArgs(cell.cellOutput.lock.args);
        if (remove0x(btcTxid) === btc_txid) {
          return { txhash: cell.outPoint!.txHash };
        }
      }

      reply.status(404);
    },
  );

  fastify.get(
    '/:btc_txid/job',
    {
      schema: {
        description: `
          Get the job state of a transaction by BTC txid.

          * completed: The CKB transaction has been sent and confirmed.
          * failed: Something went wrong during the process, and it has failed.
          * delayed: The transaction has not been confirmed yet and is waiting for confirmation.
          * active: The transaction is currently being processed.
          * waiting: The transaction is pending and is waiting to be processed.
        `,
        tags: ['RGB++'],
        params: z.object({
          btc_txid: z.string(),
        }),
        response: {
          200: z.object({
            state: z.string().describe('The state of the transaction'),
            failedReason: z.string().optional().describe('The reason why the transaction failed'),
          }),
        },
      },
    },
    async (request, reply) => {
      const { btc_txid } = request.params;
      const job = await fastify.transactionManager.getTransactionRequest(btc_txid);
      if (!job) {
        reply.status(404);
        return;
      }
      const state = await job.getState();
      if (state === 'failed') {
        return {
          state,
          failedReason: job.failedReason,
        };
      }
      return { state };
    },
  );

  done();
};

export default transactionRoute;
