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
import { CUSTOM_HEADERS } from '../../constants';

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
        const lock = genRgbppLockScript(args, isMainnet);

        const txs = await fastify.ckbIndexer.getTransactions({
          script: lock,
          scriptType: 'lock',
        });

        if (txs.objects.length > 0) {
          const [tx] = txs.objects;
          reply.header(CUSTOM_HEADERS.ResponseCacheable, 'true');
          return { txhash: tx.txHash };
        }
      }

      // query CKB transaction hash by BTC_TIME_LOCK cells
      const btcTimeLockScript = getBtcTimeLockScript(isMainnet);
      const txs = await fastify.ckbIndexer.getTransactions({
        script: {
          ...btcTimeLockScript,
          args: '0x',
        },
        scriptType: 'lock',
      });

      if (txs.objects.length > 0) {
        for (const { txHash } of txs.objects) {
          const tx = await fastify.ckbRPC.getTransaction(txHash);
          const isBtcTimeLockTx = tx.transaction.outputs.some((output) => {
            if (
              output.lock.codeHash !== btcTimeLockScript.codeHash ||
              output.lock.hashType !== btcTimeLockScript.hashType
            ) {
              return false;
            }
            const btcTxid = btcTxIdFromBtcTimeLockArgs(output.lock.args);
            return remove0x(btcTxid) === btc_txid;
          });
          if (isBtcTimeLockTx) {
            reply.header(CUSTOM_HEADERS.ResponseCacheable, 'true');
            return { txhash: txHash };
          }
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
            attempts: z.number().describe('The number of attempts made to process the transaction'),
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
      const attempts = job.attemptsMade;
      if (state === 'failed') {
        return {
          state,
          attempts,
          failedReason: job.failedReason,
        };
      }
      return {
        state,
        attempts,
      };
    },
  );

  fastify.post(
    '/retry',
    {
      schema: {
        description: 'Retry a failed transaction by BTC txid',
        tags: ['RGB++'],
        body: z.object({
          btc_txid: z.string(),
        }),
        response: {
          200: z.object({
            state: z.string().describe('The state of the transaction'),
          }),
        },
      },
    },
    async (request, reply) => {
      const { btc_txid } = request.body;
      const job = await fastify.transactionManager.getTransactionRequest(btc_txid);
      if (!job) {
        reply.status(404);
        return;
      }
      const state = await job.getState();
      if (state === 'failed') {
        await job.retry('failed');
        const newState = await job.getState();
        return { state: newState };
      }
      return { state };
    },
  );

  done();
};

export default transactionRoute;
