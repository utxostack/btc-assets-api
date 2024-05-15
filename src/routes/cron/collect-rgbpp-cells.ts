import pino from 'pino';
import { FastifyPluginCallback } from 'fastify';
import { Server } from 'http';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import container from '../../container';
import { VERCEL_MAX_DURATION } from '../../constants';
import RgbppCollector from '../../services/rgbpp';

const collectRgbppCellsCronRoute: FastifyPluginCallback<Record<never, never>, Server, ZodTypeProvider> = (
  fastify,
  _,
  done,
) => {
  fastify.get(
    '/sync-utxo',
    {
      schema: {
        tags: ['Cron Task'],
        description: 'Run UTXO sync cron task to update data cache, used for serverless deployment',
      },
    },
    async () => {
      const logger = container.resolve<pino.BaseLogger>('logger');
      const rgbppCollector: RgbppCollector = container.resolve('rgbppCollector');
      try {
        await new Promise((resolve) => {
          setTimeout(resolve, (VERCEL_MAX_DURATION - 10) * 1000);
          rgbppCollector.startProcess({
            onActive: (job) => {
              logger.info(`[rgbppCollector] Job active: ${job.id}`);
            },
            onCompleted: (job) => {
              logger.info(`[rgbppCollector] Job completed: ${job.id}`);
            },
          });
        });
        await rgbppCollector.pauseProcess();
        await rgbppCollector.closeProcess();
      } catch (err) {
        logger.error(err);
        fastify.Sentry.captureException(err);
      }
    },
  );
  done();
};

export default collectRgbppCellsCronRoute;
