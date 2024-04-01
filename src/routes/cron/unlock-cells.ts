import pino from 'pino';
import { FastifyPluginCallback } from 'fastify';
import { Server } from 'http';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import container from '../../container';
import Unlocker from '../../services/unlocker';
import * as Sentry from '@sentry/node';

const unlockCellsCronRoute: FastifyPluginCallback<Record<never, never>, Server, ZodTypeProvider> = (
  fastify,
  _,
  done,
) => {
  fastify.get(
    '/unlock-cells',
    {
      schema: {
        tags: ['Cron Task'],
        description: 'Run BTC_TIME_LOCK cells unlock cron task, used for serverless deployment',
      },
    },
    async () => {
      const logger = container.resolve<pino.BaseLogger>('logger');
      const unlocker: Unlocker = container.resolve('unlocker');
      try {
        await unlocker.unlockCells();
      } catch (err) {
        logger.error(err);
        Sentry.captureException(err);
      }
    },
  );
  done();
};

export default unlockCellsCronRoute;
