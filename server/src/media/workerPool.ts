import * as mediasoup from 'mediasoup';
import type { Worker, WorkerSettings, RtpCodecCapability } from 'mediasoup/types';
import os from 'os';

export interface WorkerPoolConfig {
  numWorkers?: number;
  rtcMinPort?: number;
  rtcMaxPort?: number;
  logLevel?: 'debug' | 'warn' | 'error' | 'none';
}

export const MEDIA_CODECS: RtpCodecCapability[] = [
  {
    kind: 'audio',
    mimeType: 'audio/opus',
    preferredPayloadType: 111,
    clockRate: 48000,
    channels: 2,
  },
  {
    kind: 'video',
    mimeType: 'video/VP8',
    preferredPayloadType: 96,
    clockRate: 90000,
    parameters: {
      'x-google-start-bitrate': 1000,
    },
  },
  {
    kind: 'video',
    mimeType: 'video/H264',
    preferredPayloadType: 125,
    clockRate: 90000,
    parameters: {
      'packetization-mode': 1,
      'profile-level-id': '42e01f',
      'level-asymmetry-allowed': 1,
    },
  },
];

export class MediasoupWorkerPool {
  private workers: Worker[] = [];
  private workerLoads: Map<Worker, number> = new Map();
  private isInitialized = false;
  private config: Required<WorkerPoolConfig>;

  constructor(config?: WorkerPoolConfig) {
    const defaultWorkers = Math.max(1, Math.min(os.cpus().length, 4));
    this.config = {
      numWorkers: config?.numWorkers || Number(process.env.MEDIASOUP_NUM_WORKERS) || defaultWorkers,
      rtcMinPort: config?.rtcMinPort || Number(process.env.MEDIASOUP_MIN_PORT) || 40000,
      rtcMaxPort: config?.rtcMaxPort || Number(process.env.MEDIASOUP_MAX_PORT) || 40200,
      logLevel: config?.logLevel || (process.env.MEDIASOUP_LOG_LEVEL as any) || 'warn',
    };
  }

  public async initialize(): Promise<void> {
    if (this.isInitialized) return;

    for (let i = 0; i < this.config.numWorkers; i++) {
      await this.spawnWorker();
    }
    this.isInitialized = true;
  }

  private async spawnWorker(): Promise<Worker> {
    const workerSettings: WorkerSettings = {
      logLevel: this.config.logLevel,
      rtcMinPort: this.config.rtcMinPort,
      rtcMaxPort: this.config.rtcMaxPort,
    };

    const worker = await mediasoup.createWorker(workerSettings);

    worker.on('died', (error) => {
      console.error(`Mediasoup worker ${worker.pid} died: ${error.message}. Spawning replacement...`);
      this.workers = this.workers.filter((w) => w !== worker);
      this.workerLoads.delete(worker);
      this.spawnWorker().catch((err) => {
        console.error('Failed to spawn replacement mediasoup worker:', err);
      });
    });

    this.workers.push(worker);
    this.workerLoads.set(worker, 0);
    return worker;
  }

  /**
   * Get least-loaded worker for router allocation
   */
  public getLeastLoadedWorker(): Worker {
    if (this.workers.length === 0) {
      throw new Error('No Mediasoup workers available.');
    }

    let minLoad = Infinity;
    let selectedWorker = this.workers[0];

    for (const worker of this.workers) {
      const load = this.workerLoads.get(worker) || 0;
      if (load < minLoad) {
        minLoad = load;
        selectedWorker = worker;
      }
    }

    this.workerLoads.set(selectedWorker, minLoad + 1);
    return selectedWorker;
  }

  /**
   * Release router load on worker
   */
  public releaseWorkerLoad(worker: Worker): void {
    const current = this.workerLoads.get(worker) || 0;
    if (current > 0) {
      this.workerLoads.set(worker, current - 1);
    }
  }

  public getWorkerCount(): number {
    return this.workers.length;
  }

  public async close(): Promise<void> {
    for (const worker of this.workers) {
      worker.close();
    }
    this.workers = [];
    this.workerLoads.clear();
    this.isInitialized = false;
  }
}
