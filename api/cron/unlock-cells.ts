import container from '../../src/container';
import Unlocker from '../../src/services/unlocker';
import config from '../../vercel.json';

const VERCEL_MAX_DURATION = config.functions['api/cron/*.ts'].maxDuration;

export default async () => {
  const unlocker: Unlocker = container.resolve('unlocker');
  await Promise.race([
    unlocker.unlockCells(),
    new Promise((resolve) => setTimeout(resolve, VERCEL_MAX_DURATION - 10_000)),
  ]);
};
