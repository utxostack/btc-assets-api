import { Job, JobsOptions, Queue, QueueOptions, Worker, WorkerOptions } from 'bullmq';
import Redis from 'ioredis';
import * as Sentry from '@sentry/node';

interface IQueueWorkerOptions {
  name: string;
  connection: Redis;
  queue?: Omit<QueueOptions, 'connection'>;
  worker?: Omit<WorkerOptions, 'connection'>;
}

interface IProcessCallbacks<T> {
  onActive?: (job: Job<T>) => void;
  onCompleted?: (job: Job<T>) => void;
  onFailed?: (job: Job<T> | undefined, err: Error) => void;
}

export default abstract class BaseQueueWorker<T, R> {
  protected queue: Queue<T>;
  protected worker: Worker<T>;

  constructor(options: IQueueWorkerOptions) {
    const { name, connection, queue, worker } = options;
    this.queue = new Queue(name, {
      connection,
      ...queue,
    });
    this.worker = new Worker(
      name,
      async (job: Job<T>) => {
        const span = Sentry.startInactiveSpan({ name: this.constructor.name, op: 'process' });
        const returnvalue = await this.process(job);
        span?.end();
        return returnvalue;
      },
      {
        connection,
        autorun: false,
        ...worker,
      },
    );
  }

  abstract process(job: Job<T>): Promise<R>;

  /**
   * Add a job to the queue
   * @param jobId - the job id
   * @param data - the data for the job
   */
  public async addJob(jobId: string, data: T, options?: Omit<JobsOptions, 'jobId'>) {
    const job = await this.queue.add(jobId, data, {
      ...options,
      jobId,
    });
    return job;
  }

  /**
   * Get the queue job counts
   */
  public async getQueueJobCounts() {
    const counts = await this.queue.getJobCounts();
    return counts;
  }

  /**
   * Check if the worker is running
   */
  public async isWorkerRunning() {
    return this.worker.isRunning();
  }

  /**
   * Start the process
   * @param callbacks - the callbacks for the process
   * - onCompleted: the callback when the job is completed
   * - onFailed: the callback when the job is failed
   */
  public async startProcess(callbacks?: IProcessCallbacks<T>): Promise<void> {
    if (callbacks?.onActive) {
      this.worker.on('active', callbacks?.onActive);
    }
    if (callbacks?.onCompleted) {
      this.worker.on('completed', callbacks.onCompleted);
    }
    if (callbacks?.onFailed) {
      this.worker.on('failed', callbacks.onFailed);
    }
    await this.worker.run();
  }

  /**
   * Pause the process
   */
  public async pauseProcess(): Promise<void> {
    await this.worker.pause();
  }

  /**
   * Close the process
   */
  public async closeProcess(): Promise<void> {
    await this.worker.close();
    await this.queue.close();
  }
}
