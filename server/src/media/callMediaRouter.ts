import type {
  Router,
  Worker,
  WebRtcTransport,
  Producer,
  Consumer,
  RtpCapabilities,
  RtpParameters,
  DtlsParameters,
  MediaKind,
  WebRtcTransportOptions,
} from 'mediasoup/types';

export interface TransportOptionsDto {
  id: string;
  iceParameters: any;
  iceCandidates: any[];
  dtlsParameters: any;
}

export interface ConsumerDto {
  id: string;
  producerId: string;
  kind: MediaKind;
  rtpParameters: RtpParameters;
  producerSocketId: string;
  producerUserId: string;
}

export class CallMediaRouter {
  public readonly roomId: string;
  public readonly router: Router;
  private readonly worker: Worker;

  // transportId -> WebRtcTransport
  private transports: Map<string, WebRtcTransport> = new Map();
  // transportId -> { socketId, direction }
  private transportMeta: Map<string, { socketId: string; direction: 'send' | 'recv' }> = new Map();
  // socketId -> Set<transportId>
  private socketTransports: Map<string, Set<string>> = new Map();

  // producerId -> Producer
  private producers: Map<string, Producer> = new Map();
  // producerId -> { socketId, userId, kind }
  private producerMeta: Map<string, { socketId: string; userId: string; kind: MediaKind }> = new Map();
  // socketId -> Set<producerId>
  private socketProducers: Map<string, Set<string>> = new Map();

  // consumerId -> Consumer
  private consumers: Map<string, Consumer> = new Map();
  // consumerId -> { socketId, producerId }
  private consumerMeta: Map<string, { socketId: string; producerId: string }> = new Map();
  // socketId -> Set<consumerId>
  private socketConsumers: Map<string, Set<string>> = new Map();

  constructor(roomId: string, router: Router, worker: Worker) {
    this.roomId = roomId;
    this.router = router;
    this.worker = worker;
  }

  public get rtpCapabilities(): RtpCapabilities {
    return this.router.rtpCapabilities;
  }

  public getWorker(): Worker {
    return this.worker;
  }

  /**
   * Create a WebRtcTransport for sending or receiving media
   */
  public async createWebRtcTransport(socketId: string, direction: 'send' | 'recv'): Promise<TransportOptionsDto> {
    const listenIps = [
      {
        ip: process.env.MEDIASOUP_LISTEN_IP || '0.0.0.0',
        announcedIp: process.env.MEDIASOUP_ANNOUNCED_IP || '127.0.0.1',
      },
    ];

    const transportOptions: WebRtcTransportOptions = {
      listenIps,
      enableUdp: true,
      enableTcp: true,
      preferUdp: true,
      initialAvailableOutgoingBitrate: 1000000,
    };

    const transport = await this.router.createWebRtcTransport(transportOptions);

    this.transports.set(transport.id, transport);
    this.transportMeta.set(transport.id, { socketId, direction });

    if (!this.socketTransports.has(socketId)) {
      this.socketTransports.set(socketId, new Set());
    }
    this.socketTransports.get(socketId)!.add(transport.id);

    transport.on('dtlsstatechange', (dtlsState: any) => {
      if (dtlsState === 'failed' || dtlsState === 'closed') {
        transport.close();
      }
    });

    transport.on('@close', () => {
      this.transports.delete(transport.id);
      this.transportMeta.delete(transport.id);
      this.socketTransports.get(socketId)?.delete(transport.id);
    });

    return {
      id: transport.id,
      iceParameters: transport.iceParameters,
      iceCandidates: transport.iceCandidates,
      dtlsParameters: transport.dtlsParameters,
    };
  }

  /**
   * Connect a client WebRtcTransport with DTLS parameters
   */
  public async connectWebRtcTransport(socketId: string, transportId: string, dtlsParameters: DtlsParameters): Promise<void> {
    const transport = this.transports.get(transportId);
    if (!transport) {
      throw new Error('Transport not found.');
    }

    const meta = this.transportMeta.get(transportId);
    if (!meta || meta.socketId !== socketId) {
      throw new Error('Unauthorized: transport not owned by caller.');
    }

    await transport.connect({ dtlsParameters });
  }

  /**
   * Create a Producer on a send transport
   */
  public async produce(
    socketId: string,
    userId: string,
    transportId: string,
    kind: MediaKind,
    rtpParameters: RtpParameters,
    appData?: any
  ): Promise<string> {
    const transport = this.transports.get(transportId);
    if (!transport) {
      throw new Error('Transport not found.');
    }

    const meta = this.transportMeta.get(transportId);
    if (!meta || meta.socketId !== socketId || meta.direction !== 'send') {
      throw new Error('Unauthorized: invalid send transport.');
    }

    const producer = await transport.produce({
      kind,
      rtpParameters,
      appData: { ...appData, socketId, userId, roomId: this.roomId },
    });

    this.producers.set(producer.id, producer);
    this.producerMeta.set(producer.id, { socketId, userId, kind });

    if (!this.socketProducers.has(socketId)) {
      this.socketProducers.set(socketId, new Set());
    }
    this.socketProducers.get(socketId)!.add(producer.id);

    producer.on('transportclose', () => {
      producer.close();
    });

    producer.on('@close', () => {
      this.producers.delete(producer.id);
      this.producerMeta.delete(producer.id);
      this.socketProducers.get(socketId)?.delete(producer.id);
    });

    return producer.id;
  }

  /**
   * Consume a remote producer on a receive transport
   */
  public async consume(
    socketId: string,
    transportId: string,
    producerId: string,
    rtpCapabilities: RtpCapabilities
  ): Promise<ConsumerDto> {
    const transport = this.transports.get(transportId);
    if (!transport) {
      throw new Error('Transport not found.');
    }

    const tMeta = this.transportMeta.get(transportId);
    if (!tMeta || tMeta.socketId !== socketId || tMeta.direction !== 'recv') {
      throw new Error('Unauthorized: invalid recv transport.');
    }

    const producer = this.producers.get(producerId);
    if (!producer) {
      throw new Error('Producer not found in this call room.');
    }

    const pMeta = this.producerMeta.get(producerId);
    if (!pMeta) {
      throw new Error('Producer metadata not found.');
    }

    // Never allow self-consumption
    if (pMeta.socketId === socketId) {
      throw new Error('Cannot consume own producer.');
    }

    if (!this.router.canConsume({ producerId, rtpCapabilities })) {
      throw new Error('Cannot consume producer with provided RTP capabilities.');
    }

    const consumer = await transport.consume({
      producerId,
      rtpCapabilities,
      paused: true, // Standard mediasoup practice: start paused until client connects
      appData: { socketId, producerId, roomId: this.roomId },
    });

    this.consumers.set(consumer.id, consumer);
    this.consumerMeta.set(consumer.id, { socketId, producerId });

    if (!this.socketConsumers.has(socketId)) {
      this.socketConsumers.set(socketId, new Set());
    }
    this.socketConsumers.get(socketId)!.add(consumer.id);

    consumer.on('transportclose', () => {
      consumer.close();
    });

    consumer.on('producerclose', () => {
      consumer.close();
    });

    consumer.on('@close', () => {
      this.consumers.delete(consumer.id);
      this.consumerMeta.delete(consumer.id);
      this.socketConsumers.get(socketId)?.delete(consumer.id);
    });

    return {
      id: consumer.id,
      producerId,
      kind: consumer.kind,
      rtpParameters: consumer.rtpParameters,
      producerSocketId: pMeta.socketId,
      producerUserId: pMeta.userId,
    };
  }

  /**
   * Resume a consumer after client has initialized local track
   */
  public async resumeConsumer(socketId: string, consumerId: string): Promise<void> {
    const consumer = this.consumers.get(consumerId);
    if (!consumer) {
      throw new Error('Consumer not found.');
    }

    const meta = this.consumerMeta.get(consumerId);
    if (!meta || meta.socketId !== socketId) {
      throw new Error('Unauthorized: consumer not owned by caller.');
    }

    await consumer.resume();
  }

  /**
   * Set preferred spatial and temporal layers for video adaptation (e.g. pinned spotlight)
   */
  public async setPreferredLayers(
    socketId: string,
    consumerId: string,
    spatialLayer: number,
    temporalLayer?: number
  ): Promise<void> {
    const consumer = this.consumers.get(consumerId);
    if (!consumer) {
      throw new Error('Consumer not found.');
    }

    const meta = this.consumerMeta.get(consumerId);
    if (!meta || meta.socketId !== socketId) {
      throw new Error('Unauthorized: consumer not owned by caller.');
    }

    if (consumer.kind === 'video') {
      await consumer.setPreferredLayers({ spatialLayer, temporalLayer });
    }
  }

  /**
   * Explicitly close a producer
   */
  public closeProducer(socketId: string, producerId: string): void {
    const producer = this.producers.get(producerId);
    if (!producer) return;

    const meta = this.producerMeta.get(producerId);
    if (!meta || meta.socketId !== socketId) {
      throw new Error('Unauthorized: producer not owned by caller.');
    }

    producer.close();
  }

  /**
   * Get all active producers in this room (excluding a socket if specified)
   */
  public getActiveProducers(excludeSocketId?: string): Array<{
    producerId: string;
    socketId: string;
    userId: string;
    kind: MediaKind;
  }> {
    const list: Array<{ producerId: string; socketId: string; userId: string; kind: MediaKind }> = [];
    for (const [producerId, meta] of this.producerMeta.entries()) {
      if (!excludeSocketId || meta.socketId !== excludeSocketId) {
        list.push({
          producerId,
          socketId: meta.socketId,
          userId: meta.userId,
          kind: meta.kind,
        });
      }
    }
    return list;
  }

  /**
   * Clean up all resources belonging to a participant upon leave/disconnect
   */
  public handleParticipantLeave(socketId: string): void {
    // 1. Close all producers owned by this socket
    const pIds = this.socketProducers.get(socketId);
    if (pIds) {
      for (const pId of Array.from(pIds)) {
        const prod = this.producers.get(pId);
        prod?.close();
      }
      this.socketProducers.delete(socketId);
    }

    // 2. Close all consumers owned by this socket
    const cIds = this.socketConsumers.get(socketId);
    if (cIds) {
      for (const cId of Array.from(cIds)) {
        const cons = this.consumers.get(cId);
        cons?.close();
      }
      this.socketConsumers.delete(socketId);
    }

    // 3. Close all transports owned by this socket
    const tIds = this.socketTransports.get(socketId);
    if (tIds) {
      for (const tId of Array.from(tIds)) {
        const tr = this.transports.get(tId);
        tr?.close();
      }
      this.socketTransports.delete(socketId);
    }
  }

  /**
   * Dispose entire router and all active media objects
   */
  public close(): void {
    for (const cons of this.consumers.values()) {
      cons.close();
    }
    for (const prod of this.producers.values()) {
      prod.close();
    }
    for (const tr of this.transports.values()) {
      tr.close();
    }

    this.consumers.clear();
    this.consumerMeta.clear();
    this.socketConsumers.clear();

    this.producers.clear();
    this.producerMeta.clear();
    this.socketProducers.clear();

    this.transports.clear();
    this.transportMeta.clear();
    this.socketTransports.clear();

    this.router.close();
  }
}
