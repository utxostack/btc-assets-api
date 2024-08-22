import { FastifyPluginCallback } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import { Server } from 'http';
import z from 'zod';
import { CKBVirtualResult } from './types';
import { Job } from 'bullmq';
import { CUSTOM_HEADERS } from '../../constants';
import { JwtPayload } from '../../plugins/jwt';

const transactionRoute: FastifyPluginCallback<Record<never, never>, Server, ZodTypeProvider> = (fastify, _, done) => {
  fastify.post(
    '/ckb-tx',
    {
      schema: {
        description: 'Submit a RGB++ CKB transaction',
        tags: ['RGB++'],
        body: z.object({
          btc_txid: z.string(),
          ckb_virtual_result: CKBVirtualResult.or(z.string()).transform((value) => {
            if (typeof value === 'string') {
              value = JSON.parse(value);
            }
            const parsed = CKBVirtualResult.safeParse(value);
            if (!parsed.success) {
              throw new Error(`Invalid CKB virtual result: ${JSON.stringify(parsed.error.flatten())}`);
            }
            return parsed.data;
          }),
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
      const jwt = (await request.jwtDecode()) as JwtPayload;
      const job: Job = await fastify.transactionProcessor.enqueueTransaction({
        txid: btc_txid,
        ckbVirtualResult: ckb_virtual_result,
        context: { jwt },
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
      // get the transaction hash from the job if it exists
      const job = await fastify.transactionProcessor.getTransactionRequest(btc_txid);
      if (job?.returnvalue) {
        return { txhash: job.returnvalue };
      }

      const btcTx = await fastify.bitcoin.getTx({ txid: btc_txid });
      const rgbppLockTx = await fastify.rgbppCollector.queryRgbppLockTxByBtcTx(btcTx);
      if (rgbppLockTx) {
        reply.header(CUSTOM_HEADERS.ResponseCacheable, 'true');
        return { txhash: rgbppLockTx.txHash };
      }
      const btcTimeLockTx = await fastify.rgbppCollector.queryBtcTimeLockTxByBtcTxId(btcTx);
      if (btcTimeLockTx) {
        reply.header(CUSTOM_HEADERS.ResponseCacheable, 'true');
        return { txhash: btcTimeLockTx.transaction.hash };
      }

      reply.status(404);
    },
  );

  const jobInfoSchema = z.object({
    state: z.string().describe('The state of the transaction'),
    attempts: z.number().describe('The number of attempts made to process the transaction'),
    failedReason: z.string().optional().describe('The reason why the transaction failed'),
    data: z
      .object({
        txid: z.string(),
        ckbVirtualResult: CKBVirtualResult,
      })
      .describe('The data of the transaction')
      .optional(),
  });

  fastify.get(
    '/:btc_txid/job',
    {
      schema: {
        description: `
          Get the job info of a transaction by BTC txid.

          The state of the transaction can be one of the following:
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
        querystring: z.object({
          with_data: z.enum(['true', 'false']).default('false'),
        }),
        response: {
          200: jobInfoSchema,
        },
      },
    },
    async (request, reply) => {
      const { btc_txid } = request.params;
      const { with_data } = request.query;
      const job = await fastify.transactionProcessor.getTransactionRequest(btc_txid);
      if (!job) {
        reply.status(404);
        return;
      }
      const state = await job.getState();
      const attempts = job.attemptsMade;

      const jobInfo: z.infer<typeof jobInfoSchema> = {
        state,
        attempts,
      };

      if (with_data === 'true') {
        const { txid, ckbVirtualResult } = job.data;
        jobInfo.data = {
          txid,
          ckbVirtualResult,
        };
      }

      if (state === 'failed') {
        jobInfo.failedReason = job.failedReason;
      }
      return jobInfo;
    },
  );

  fastify.post(
    '/retry',
    {
      schema: {
        description: 'Retry a failed transaction by BTC txid, only failed transactions can be retried.',
        tags: ['RGB++'],
        body: z.object({
          btc_txid: z.string(),
        }),
        response: {
          200: z.object({
            success: z.boolean().describe('Whether the transaction has been retried successfully'),
            state: z.string().describe('The state of the transaction'),
          }),
        },
      },
    },
    async (request, reply) => {
      const { btc_txid } = request.body;
      const job = await fastify.transactionProcessor.getTransactionRequest(btc_txid);
      if (!job) {
        reply.status(404);
        return;
      }
      const state = await job.getState();
      if (state === 'failed') {
        await job.retry('failed');
        const newState = await job.getState();
        return {
          success: true,
          state: newState,
        };
      }
      return {
        success: false,
        state,
      };
    },
  );

  done();
};

export default transactionRoute;
