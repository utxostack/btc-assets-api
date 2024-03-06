import { Cradle } from '../container';
import { Job, Queue, Worker } from 'bullmq';

type BtcTxid = string;
interface CKBTransaction {}

export default class TransactionQueue {
  private queueName = 'rgbpp-ckb-transaction-queue';
  private queue: Queue<CKBTransaction>;
  private worker: Worker<CKBTransaction>;

  constructor({ redis }: Cradle) {
    this.queue = new Queue(this.queueName, {
      connection: redis,
    });
    this.worker = new Worker(
      this.queueName,
      async (job) => {
        // TODO: handle rgb++ ckb transaction
        console.log('Processing job', job.id);
        console.log('Job data', job.data);
      },
      {
        connection: redis,
        autorun: false,
        concurrency: 10,
        // FIXME: for local development
        removeOnComplete: { count: 0 },
        removeOnFail: { count: 0 },
      },
    );
  }

  async add(txid: BtcTxid, ckbTx: CKBTransaction) {
    await this.queue.add(txid, ckbTx, { jobId: txid });
  }

  async getJob(txid: BtcTxid) {
    const job = await Job.fromId(this.queue, txid);
    return job;
  }

  async startProcess(onCompleted?: (job: Job<CKBTransaction>) => void) {
    if (onCompleted) {
      this.worker.on('completed', onCompleted);
    }
    await this.worker.run();
  }

  async pauseProcess(doNotWaitActive = false) {
    await this.worker.pause(doNotWaitActive);
  }

  async close() {
    await this.worker.close();
    await this.queue.close();
  }
}
