import { MediasoupWorkerPool, MEDIA_CODECS } from './workerPool.js';
import { CallMediaRouter, TransportOptionsDto, ConsumerDto } from './callMediaRouter.js';
import type { RtpCapabilities, DtlsParameters, RtpParameters, MediaKind } from 'mediasoup/types';

export class MediasoupManager {
  private workerPool: MediasoupWorkerPool;
  private callRouters: Map<string, CallMediaRouter> = new Map();
  private routerLocks: Map<string, Promise<CallMediaRouter>> = new Map();
  private isInitialized = false;

  constructor() {
    this.workerPool = new MediasoupWorkerPool();
  }

  public async initialize(): Promise<void> {
    if (this.isInitialized) return;
    await this.workerPool.initialize();
    this.isInitialized = true;
  }

  public async getOrCreateCallRouter(roomId: string): Promise<CallMediaRouter> {
    const existing = this.callRouters.get(roomId);
    if (existing) return existing;

    // Concurrency lock to avoid duplicate router creation for same room
    const pending = this.routerLocks.get(roomId);
    if (pending) return pending;

    const creationPromise = (async () => {
      await this.initialize();
      const worker = this.workerPool.getLeastLoadedWorker();
      const router = await worker.createRouter({ mediaCodecs: MEDIA_CODECS });
      const callRouter = new CallMediaRouter(roomId, router, worker);

      this.callRouters.set(roomId, callRouter);
      this.routerLocks.delete(roomId);
      return callRouter;
    })();

    this.routerLocks.set(roomId, creationPromise);
    return creationPromise;
  }

  public getCallRouter(roomId: string): CallMediaRouter | undefined {
    return this.callRouters.get(roomId);
  }

  public async getRouterCapabilities(roomId: string): Promise<RtpCapabilities> {
    const callRouter = await this.getOrCreateCallRouter(roomId);
    return callRouter.rtpCapabilities;
  }

  public async createWebRtcTransport(
    roomId: string,
    socketId: string,
    direction: 'send' | 'recv'
  ): Promise<TransportOptionsDto> {
    const callRouter = await this.getOrCreateCallRouter(roomId);
    return callRouter.createWebRtcTransport(socketId, direction);
  }

  public async connectWebRtcTransport(
    roomId: string,
    socketId: string,
    transportId: string,
    dtlsParameters: DtlsParameters
  ): Promise<void> {
    const callRouter = this.callRouters.get(roomId);
    if (!callRouter) throw new Error('Call router not found for this room.');
    return callRouter.connectWebRtcTransport(socketId, transportId, dtlsParameters);
  }

  public async createProducer(
    roomId: string,
    socketId: string,
    userId: string,
    transportId: string,
    kind: MediaKind,
    rtpParameters: RtpParameters,
    appData?: any
  ): Promise<string> {
    const callRouter = this.callRouters.get(roomId);
    if (!callRouter) throw new Error('Call router not found for this room.');
    return callRouter.produce(socketId, userId, transportId, kind, rtpParameters, appData);
  }

  public async createConsumer(
    roomId: string,
    socketId: string,
    transportId: string,
    producerId: string,
    rtpCapabilities: RtpCapabilities
  ): Promise<ConsumerDto> {
    const callRouter = this.callRouters.get(roomId);
    if (!callRouter) throw new Error('Call router not found for this room.');
    return callRouter.consume(socketId, transportId, producerId, rtpCapabilities);
  }

  public async resumeConsumer(roomId: string, socketId: string, consumerId: string): Promise<void> {
    const callRouter = this.callRouters.get(roomId);
    if (!callRouter) throw new Error('Call router not found for this room.');
    return callRouter.resumeConsumer(socketId, consumerId);
  }

  public async setPreferredLayers(
    roomId: string,
    socketId: string,
    consumerId: string,
    spatialLayer: number,
    temporalLayer?: number
  ): Promise<void> {
    const callRouter = this.callRouters.get(roomId);
    if (!callRouter) throw new Error('Call router not found for this room.');
    return callRouter.setPreferredLayers(socketId, consumerId, spatialLayer, temporalLayer);
  }

  public closeProducer(roomId: string, socketId: string, producerId: string): void {
    const callRouter = this.callRouters.get(roomId);
    if (!callRouter) return;
    callRouter.closeProducer(socketId, producerId);
  }

  public getActiveProducers(roomId: string, excludeSocketId?: string) {
    const callRouter = this.callRouters.get(roomId);
    if (!callRouter) return [];
    return callRouter.getActiveProducers(excludeSocketId);
  }

  public handleParticipantLeave(roomId: string, socketId: string): void {
    const callRouter = this.callRouters.get(roomId);
    if (!callRouter) return;
    callRouter.handleParticipantLeave(socketId);
  }

  public disposeCallRouter(roomId: string): void {
    const callRouter = this.callRouters.get(roomId);
    if (!callRouter) return;

    this.workerPool.releaseWorkerLoad(callRouter.getWorker());
    callRouter.close();
    this.callRouters.delete(roomId);
  }

  public async close(): Promise<void> {
    for (const [roomId] of this.callRouters) {
      this.disposeCallRouter(roomId);
    }
    await this.workerPool.close();
    this.isInitialized = false;
  }
}

export const mediasoupManager = new MediasoupManager();
