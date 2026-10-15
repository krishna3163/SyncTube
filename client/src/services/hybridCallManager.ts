import { Device } from 'mediasoup-client';
import type { Transport, Producer, Consumer, RtpCapabilities } from 'mediasoup-client/types';
import { socket } from './socket.js';

export interface NetworkQuality {
  state: 'good' | 'unstable' | 'poor';
  rtt: number;
  packetLoss: number;
}

export interface CallParticipantState {
  socketId: string;
  userId: string;
  username: string;
  avatarId?: string;
  stream?: MediaStream;
  isMuted: boolean;
  isCameraOff: boolean;
  isScreenSharing: boolean;
  isSpeaking: boolean;
  isLocal?: boolean;
  isPinned?: boolean;
  networkQuality?: 'good' | 'unstable' | 'poor';
}

const DEFAULT_ICE_SERVERS: RTCConfiguration = {
  iceServers: [
    { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302', 'stun:stun2.l.google.com:19302'] },
    { urls: 'stun:global.stun.twilio.com:3478' },
    { urls: 'stun:stun.services.mozilla.com' },
    // Free high-performance public TURN relay with UDP and TCP transport for 4G/5G mobile CGNAT / symmetric NAT
    {
      urls: [
        'turn:openrelay.metered.ca:80',
        'turn:openrelay.metered.ca:443',
        'turn:openrelay.metered.ca:443?transport=tcp',
      ],
      username: 'openrelayproject',
      credential: 'openrelayproject',
    },
  ],
  iceCandidatePoolSize: 10,
};

type PeersChangeCallback = (peers: CallParticipantState[]) => void;
type LocalStreamCallback = (stream: MediaStream | null) => void;
type SpeakingCallback = (socketId: string, isSpeaking: boolean) => void;
type CallCountCallback = (count: number) => void;
type TopologyCallback = (mode: 'idle' | 'p2p' | 'sfu') => void;
type NetworkQualityCallback = (quality: NetworkQuality) => void;

export class HybridCallManager {
  private localStream: MediaStream | null = null;
  private screenStream: MediaStream | null = null;

  // Hybrid Topology State
  private topologyMode: 'idle' | 'p2p' | 'sfu' = 'idle';
  private topologyVersion: number = 1;
  private isTransitioning: boolean = false;
  private pinnedSocketId: string | null = null;
  private networkQuality: NetworkQuality = { state: 'good', rtt: 0, packetLoss: 0 };

  // 1-to-1 P2P State
  private p2pPeerConnection: RTCPeerConnection | null = null;
  private p2pRemoteSocketId: string | null = null;
  private p2pPendingCandidates: RTCIceCandidateInit[] = [];
  private isMakingOffer: boolean = false;
  private ignoreOffer: boolean = false;

  // Mediasoup SFU State
  private sfuDevice: Device | null = null;
  private sfuSendTransport: Transport | null = null;
  private sfuRecvTransport: Transport | null = null;
  private sfuAudioProducer: Producer | null = null;
  private sfuVideoProducer: Producer | null = null;
  // consumerId -> Consumer
  private sfuConsumers: Map<string, Consumer> = new Map();
  // socketId -> MediaStream
  private sfuRemoteStreams: Map<string, MediaStream> = new Map();

  // Participant directory: socketId -> CallParticipantState
  private participants: Map<string, CallParticipantState> = new Map();

  private isMuted: boolean = false;
  private isCameraOff: boolean = true;
  private isScreenSharing: boolean = false;
  private isInCall: boolean = false;

  private localUserId: string = '';
  private localUsername: string = '';
  private localAvatarId?: string;

  // Subscriptions
  private onPeersChangeCallbacks: Set<PeersChangeCallback> = new Set();
  private onLocalStreamCallbacks: Set<LocalStreamCallback> = new Set();
  private onSpeakingCallbacks: Set<SpeakingCallback> = new Set();
  private onCallCountCallbacks: Set<CallCountCallback> = new Set();
  private onForceMutedCallbacks: Set<(mutedBy: string) => void> = new Set();
  private onTopologyCallbacks: Set<TopologyCallback> = new Set();
  private onNetworkQualityCallbacks: Set<NetworkQualityCallback> = new Set();

  // Audio VAD & Telemetry intervals
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private vadInterval: any = null;
  private telemetryInterval: any = null;
  private wasSpeaking: boolean = false;

  constructor() {
    this.setupSocketListeners();
  }

  public setLocalUser(userId: string, username: string, avatarId?: string): void {
    this.localUserId = userId;
    this.localUsername = username;
    this.localAvatarId = avatarId;
  }

  private setupSocketListeners(): void {
    if (!socket) return;

    // Call participant list updates
    socket.on('call:participants_updated', (data: { count?: number; callers?: CallParticipantState[]; participants?: CallParticipantState[] }) => {
      const count = typeof data.count === 'number' ? data.count : (data.callers || data.participants || []).length;
      this.notifyCallCount(count);

      const callersList = data.participants || data.callers;
      if (Array.isArray(callersList) && !this.isInCall) {
        callersList.forEach((caller) => {
          if (!this.participants.has(caller.socketId)) {
            this.participants.set(caller.socketId, {
              ...caller,
              isLocal: Boolean(socket && Boolean(socket && caller.socketId === socket.id)),
              isSpeaking: false,
              isPinned: this.pinnedSocketId === caller.socketId,
              networkQuality: 'good',
            });
          }
        });
        this.notifyPeersChange();
      }
    });

    // Initial participants & topology state received when joining call
    socket.on('call:existing_participants', (data: { participants: CallParticipantState[]; topology?: { mode: 'idle' | 'p2p' | 'sfu'; version: number } }) => {
      if (data.topology) {
        this.topologyMode = data.topology.mode;
        this.topologyVersion = data.topology.version;
        this.notifyTopology(this.topologyMode);
      }

      data.participants.forEach((p) => {
        if (Boolean(!socket || p.socketId !== socket.id)) {
          const existing = this.participants.get(p.socketId);
          this.participants.set(p.socketId, {
            ...p,
            stream: existing?.stream,
            isLocal: false,
            isSpeaking: false,
            isPinned: this.pinnedSocketId === p.socketId,
            networkQuality: 'good',
          });
        }
      });
      this.notifyPeersChange();
      this.coordinateTopology();
    });

    // Remote user joined call
    socket.on('call:user_joined', (caller: CallParticipantState) => {
      if (Boolean(socket && Boolean(socket && caller.socketId === socket.id))) return;
      this.participants.set(caller.socketId, {
        ...caller,
        isLocal: false,
        isSpeaking: false,
        isPinned: this.pinnedSocketId === caller.socketId,
        networkQuality: 'good',
      });
      this.notifyPeersChange();
    });

    // Topology shift broadcast from server (e.g. 2 callers -> P2P, 3 callers -> SFU)
    socket.on('call:topology_transition', async (transition: { previousMode: string; mode: 'idle' | 'p2p' | 'sfu'; version: number; activeCallers: string[] }) => {
      console.log(`[HybridCall] Topology transition: ${transition.previousMode} -> ${transition.mode} (v${transition.version})`);
      this.topologyMode = transition.mode;
      this.topologyVersion = transition.version;
      this.isTransitioning = transition.mode === 'sfu' && transition.previousMode === 'p2p';
      this.notifyTopology(this.topologyMode);

      await this.coordinateTopology();
    });

    // Topology confirmed
    socket.on('call:topology_confirmed', () => {
      this.isTransitioning = false;
    });

    // Remote user left call
    socket.on('call:user_left', (data: { socketId: string }) => {
      this.participants.delete(data.socketId);
      if (this.p2pRemoteSocketId === data.socketId) {
        this.teardownP2P();
      }
      this.cleanupSfuParticipant(data.socketId);
      this.notifyPeersChange();
    });

    // Remote media state changed
    socket.on('call:user_media_state', (data: { socketId: string; isMuted: boolean; isCameraOff: boolean; isScreenSharing: boolean }) => {
      const p = this.participants.get(data.socketId);
      if (p) {
        p.isMuted = data.isMuted;
        p.isCameraOff = data.isCameraOff;
        p.isScreenSharing = data.isScreenSharing;
        this.notifyPeersChange();
      }
    });

    // Remote speaking state
    socket.on('call:user_speaking', (data: { socketId: string; isSpeaking: boolean }) => {
      const p = this.participants.get(data.socketId);
      if (p) {
        p.isSpeaking = data.isSpeaking;
        this.notifyPeersChange();
        this.notifySpeaking(data.socketId, data.isSpeaking);
      }
    });

    // Host force muted
    socket.on('call:force_muted', (data: { mutedBy: string }) => {
      this.muteLocalAudio(true);
      this.onForceMutedCallbacks.forEach((cb) => cb(data.mutedBy));
    });

    // Host force stopped screen share
    socket.on('call:force_stop_screenshare', () => {
      this.stopScreenShare();
      if (socket) {
        socket.emit('call:media_state', {
          isMuted: this.isMuted,
          isCameraOff: this.isCameraOff,
          isScreenSharing: false,
        });
      }
    });

    // Host force removed/blocked user from call
    socket.on('call:force_left', () => {
      this.leaveCall();
    });

    // P2P Signaling (1-to-1)
    socket.on('call:p2p:offer', async (data: { fromSocketId: string; offer: RTCSessionDescriptionInit }) => {
      if (this.topologyMode !== 'p2p' && !this.isTransitioning) return;
      await this.handleP2POffer(data.fromSocketId, data.offer);
    });

    socket.on('call:p2p:answer', async (data: { fromSocketId: string; answer: RTCSessionDescriptionInit }) => {
      if (this.topologyMode !== 'p2p' && !this.isTransitioning) return;
      await this.handleP2PAnswer(data.fromSocketId, data.answer);
    });

    socket.on('call:p2p:ice_candidate', async (data: { fromSocketId: string; candidate: RTCIceCandidateInit }) => {
      if (this.topologyMode !== 'p2p' && !this.isTransitioning) return;
      await this.handleP2PIceCandidate(data.fromSocketId, data.candidate);
    });

    // SFU Notifications (Group Calls >= 3)
    socket.on('call:producer_added', async (data: { producerId: string; producerSocketId: string; producerUserId: string; kind: 'audio' | 'video' }) => {
      if (this.topologyMode === 'sfu' && this.isInCall) {
        await this.consumeSfuProducer(data.producerId, data.producerSocketId);
      }
    });

    socket.on('call:producer_removed', (data: { producerId: string; producerSocketId: string }) => {
      this.removeSfuConsumer(data.producerId, data.producerSocketId);
    });
  }

  // ==========================================
  // TOPOLOGY COORDINATION
  // ==========================================

  private async coordinateTopology(): Promise<void> {
    if (!this.isInCall) return;

    if (this.topologyMode === 'p2p') {
      // Find the other single remote participant
      const remotePeer = Array.from(this.participants.values()).find((p) => !p.isLocal);
      if (remotePeer) {
        await this.initiateP2P(remotePeer.socketId);
      }
    } else if (this.topologyMode === 'sfu') {
      await this.setupSfuSession();
    }
  }

  // ==========================================
  // 1-TO-1 P2P WEBRTC IMPLEMENTATION
  // ==========================================

  private async initiateP2P(remoteSocketId: string): Promise<void> {
    if (this.p2pPeerConnection && this.p2pRemoteSocketId === remoteSocketId) {
      return;
    }
    this.teardownP2P();

    this.p2pRemoteSocketId = remoteSocketId;
    const pc = new RTCPeerConnection(DEFAULT_ICE_SERVERS);
    this.p2pPeerConnection = pc;

    // Attach local audio track or transceiver
    const audioTrack = this.localStream?.getAudioTracks()[0];
    if (audioTrack) {
      pc.addTrack(audioTrack, this.localStream!);
    } else {
      pc.addTransceiver('audio', { direction: 'sendrecv' });
    }

    // Attach local video track or transceiver upfront so SDP always includes video capabilities
    const videoTrack = this.localStream?.getVideoTracks()[0];
    if (videoTrack && !this.isCameraOff) {
      pc.addTrack(videoTrack, this.localStream!);
    } else {
      pc.addTransceiver('video', { direction: 'sendrecv' });
    }

    pc.onicecandidate = (event) => {
      if (event.candidate && socket) {
        socket.emit('call:p2p:ice_candidate', {
          targetSocketId: remoteSocketId,
          candidate: event.candidate,
        });
      }
    };

    pc.oniceconnectionstatechange = () => {
      console.log(`[P2P] ICE state with ${remoteSocketId}: ${pc.iceConnectionState}`);
      if (pc.iceConnectionState === 'failed') {
        console.warn('[P2P] ICE connection failed, attempting ICE restart...');
        try {
          pc.restartIce?.();
        } catch {}
      }
    };

    pc.ontrack = (event) => {
      console.log(`[P2P] ontrack: ${event.track.kind} (${event.track.id}) from ${remoteSocketId}`);
      const p = this.participants.get(remoteSocketId);
      if (!p) return;

      let remoteStream = p.stream;
      if (!remoteStream) {
        remoteStream = event.streams[0] || new MediaStream();
      }

      if (!remoteStream.getTracks().some((t) => t.id === event.track.id)) {
        remoteStream.addTrack(event.track);
      }

      event.track.onended = () => this.notifyPeersChange();
      event.track.onmute = () => this.notifyPeersChange();
      event.track.onunmute = () => this.notifyPeersChange();

      this.participants.set(remoteSocketId, {
        ...p,
        stream: remoteStream,
      });
      this.notifyPeersChange();
    };

    // Perfect negotiation: Polite peer pattern
    const isPolite = (socket && socket.id) ? socket.id.localeCompare(remoteSocketId) > 0 : false;

    pc.onnegotiationneeded = async () => {
      try {
        this.isMakingOffer = true;
        await pc.setLocalDescription();
        if (socket && pc.localDescription) {
          socket.emit('call:p2p:offer', {
            targetSocketId: remoteSocketId,
            offer: pc.localDescription,
          });
        }
      } catch (err) {
        console.error('[P2P] Negotiation error:', err);
      } finally {
        this.isMakingOffer = false;
      }
    };
  }

  private async handleP2POffer(fromSocketId: string, offer: RTCSessionDescriptionInit): Promise<void> {
    if (!this.p2pPeerConnection || this.p2pRemoteSocketId !== fromSocketId) {
      await this.initiateP2P(fromSocketId);
    }
    const pc = this.p2pPeerConnection!;
    const isPolite = (socket && socket.id) ? socket.id.localeCompare(fromSocketId) > 0 : false;

    const offerCollision = this.isMakingOffer || pc.signalingState !== 'stable';
    this.ignoreOffer = !isPolite && offerCollision;
    if (this.ignoreOffer) {
      console.log(`[P2P] Impolite peer ignoring offer collision from ${fromSocketId}`);
      return;
    }

    try {
      if (offerCollision) {
        await Promise.all([
          pc.setLocalDescription({ type: 'rollback' }),
          pc.setRemoteDescription(offer),
        ]);
      } else {
        await pc.setRemoteDescription(offer);
      }

      // Drain pending candidates
      while (this.p2pPendingCandidates.length > 0) {
        const c = this.p2pPendingCandidates.shift()!;
        await pc.addIceCandidate(new RTCIceCandidate(c)).catch(() => {});
      }

      await pc.setLocalDescription();
      if (socket && pc.localDescription) {
        socket.emit('call:p2p:answer', {
          targetSocketId: fromSocketId,
          answer: pc.localDescription,
        });
      }
    } catch (err) {
      console.error('[P2P] handleP2POffer error:', err);
    }
  }

  private async handleP2PAnswer(fromSocketId: string, answer: RTCSessionDescriptionInit): Promise<void> {
    if (!this.p2pPeerConnection || this.p2pRemoteSocketId !== fromSocketId) return;
    try {
      await this.p2pPeerConnection.setRemoteDescription(answer);

      while (this.p2pPendingCandidates.length > 0) {
        const c = this.p2pPendingCandidates.shift()!;
        await this.p2pPeerConnection.addIceCandidate(new RTCIceCandidate(c)).catch(() => {});
      }
    } catch (err) {
      console.error('[P2P] handleP2PAnswer error:', err);
    }
  }

  private async handleP2PIceCandidate(fromSocketId: string, candidate: RTCIceCandidateInit): Promise<void> {
    if (!this.p2pPeerConnection || this.p2pRemoteSocketId !== fromSocketId) {
      this.p2pPendingCandidates.push(candidate);
      return;
    }
    if (this.p2pPeerConnection.remoteDescription) {
      await this.p2pPeerConnection.addIceCandidate(new RTCIceCandidate(candidate)).catch(() => {});
    } else {
      this.p2pPendingCandidates.push(candidate);
    }
  }

  private teardownP2P(): void {
    if (this.p2pPeerConnection) {
      this.p2pPeerConnection.close();
      this.p2pPeerConnection = null;
    }
    this.p2pRemoteSocketId = null;
    this.p2pPendingCandidates = [];
  }

  // ==========================================
  // MEDIASOUP SFU IMPLEMENTATION (Group Calls >= 3)
  // ==========================================

  private async setupSfuSession(): Promise<void> {
    if (!socket || !this.isInCall) return;

    try {
      // 1. Load Device with Router RTP Capabilities
      if (!this.sfuDevice) {
        const capsRes: any = await new Promise((resolve) => {
          socket.emit('sfu:get_router_capabilities', {}, (res: any) => resolve(res));
        });

        if (!capsRes?.success || !capsRes?.rtpCapabilities) {
          console.error('[SFU] Failed to get router capabilities:', capsRes?.error);
          return;
        }

        const device = new Device();
        await device.load({ routerRtpCapabilities: capsRes.rtpCapabilities });
        this.sfuDevice = device;
      }

      // 2. Create Send Transport if not already established
      if (!this.sfuSendTransport) {
        const sendDto: any = await new Promise((resolve) => {
          socket.emit('sfu:create_transport', { direction: 'send' }, (res: any) => resolve(res));
        });

        if (sendDto?.success && sendDto?.transport) {
          const transport = this.sfuDevice.createSendTransport(sendDto.transport);

          transport.on('connect', ({ dtlsParameters }, success, errback) => {
            socket.emit('sfu:connect_transport', { transportId: transport.id, dtlsParameters }, (res: any) => {
              if (res?.success) success();
              else errback(new Error(res?.error || 'Connect transport failed'));
            });
          });

          transport.on('produce', ({ kind, rtpParameters, appData }, success, errback) => {
            socket.emit('sfu:produce', { transportId: transport.id, kind, rtpParameters, appData }, (res: any) => {
              if (res?.success) success({ id: res.producerId });
              else errback(new Error(res?.error || 'Produce failed'));
            });
          });

          this.sfuSendTransport = transport;
        }
      }

      // 3. Create Recv Transport if not already established
      if (!this.sfuRecvTransport) {
        const recvDto: any = await new Promise((resolve) => {
          socket.emit('sfu:create_transport', { direction: 'recv' }, (res: any) => resolve(res));
        });

        if (recvDto?.success && recvDto?.transport) {
          const transport = this.sfuDevice.createRecvTransport(recvDto.transport);

          transport.on('connect', ({ dtlsParameters }, success, errback) => {
            socket.emit('sfu:connect_transport', { transportId: transport.id, dtlsParameters }, (res: any) => {
              if (res?.success) success();
              else errback(new Error(res?.error || 'Connect recv transport failed'));
            });
          });

          this.sfuRecvTransport = transport;
        }
      }

      // 4. Publish Local Producers
      await this.publishLocalSfuProducers();

      // 5. Consume Existing Producers
      const activeProducersRes: any = await new Promise((resolve) => {
        socket.emit('sfu:get_active_producers', {}, (res: any) => resolve(res));
      });

      if (activeProducersRes?.success && Array.isArray(activeProducersRes.producers)) {
        for (const prod of activeProducersRes.producers) {
          await this.consumeSfuProducer(prod.producerId, prod.socketId);
        }
      }

      // 6. Confirm SFU Ready to server & safely close P2P connection if migrating
      socket.emit('call:sfu_ready', { version: this.topologyVersion });
      if (this.isTransitioning) {
        this.teardownP2P();
        this.isTransitioning = false;
      }
    } catch (err) {
      console.error('[SFU] setupSfuSession error:', err);
    }
  }

  private async publishLocalSfuProducers(): Promise<void> {
    if (!this.sfuSendTransport || !this.localStream) return;

    // 1. Audio Producer
    const audioTrack = this.localStream.getAudioTracks()[0];
    if (audioTrack && !this.sfuAudioProducer) {
      try {
        const audioProducer = await this.sfuSendTransport.produce({
          track: audioTrack,
          codecOptions: {
            opusStereo: true,
            opusDtx: true,
          },
        });
        this.sfuAudioProducer = audioProducer;
      } catch (err) {
        console.error('[SFU] Error producing audio:', err);
      }
    }

    // 2. Video Producer with Simulcast Encodings
    const videoTrack = this.localStream.getVideoTracks()[0];
    if (videoTrack && !this.isCameraOff && !this.sfuVideoProducer) {
      try {
        const videoProducer = await this.sfuSendTransport.produce({
          track: videoTrack,
          encodings: [
            { rid: 'r0', maxBitrate: 150000, scaleResolutionDownBy: 4.0 },
            { rid: 'r1', maxBitrate: 500000, scaleResolutionDownBy: 2.0 },
            { rid: 'r2', maxBitrate: 1500000, scaleResolutionDownBy: 1.0 },
          ],
          codecOptions: {
            videoGoogleStartBitrate: 1000,
          },
        });
        this.sfuVideoProducer = videoProducer;
      } catch (err) {
        console.error('[SFU] Error producing video with simulcast:', err);
      }
    }
  }

  private async consumeSfuProducer(producerId: string, producerSocketId: string): Promise<void> {
    if (!this.sfuRecvTransport || !this.sfuDevice || Boolean(socket && producerSocketId === socket.id)) return;

    try {
      const consumeDto: any = await new Promise((resolve) => {
        socket.emit(
          'sfu:consume',
          {
            transportId: this.sfuRecvTransport!.id,
            producerId,
            rtpCapabilities: this.sfuDevice!.rtpCapabilities,
          },
          (res: any) => resolve(res)
        );
      });

      if (!consumeDto?.success || !consumeDto.consumer) {
        return;
      }

      const { consumer: cInfo } = consumeDto;
      const consumer = await this.sfuRecvTransport.consume({
        id: cInfo.id,
        producerId: cInfo.producerId,
        kind: cInfo.kind,
        rtpParameters: cInfo.rtpParameters,
      });

      this.sfuConsumers.set(consumer.id, consumer);

      // Attach track to remote participant's stream
      let remoteStream = this.sfuRemoteStreams.get(producerSocketId);
      if (!remoteStream) {
        remoteStream = new MediaStream();
        this.sfuRemoteStreams.set(producerSocketId, remoteStream);
      }
      remoteStream.addTrack(consumer.track);

      const p = this.participants.get(producerSocketId);
      if (p) {
        p.stream = remoteStream;
        this.notifyPeersChange();
      }

      // Resume consumer on server
      socket.emit('sfu:consumer_resume', { consumerId: consumer.id });

      // Apply initial layer configuration
      if (consumer.kind === 'video') {
        const isPinned = this.pinnedSocketId === producerSocketId;
        const spatial = isPinned ? 2 : 1;
        const temporal = isPinned ? 2 : 1;
        socket.emit('sfu:consumer_preferred_layers', {
          consumerId: consumer.id,
          spatialLayer: spatial,
          temporalLayer: temporal,
        });
      }
    } catch (err) {
      console.error('[SFU] consumeSfuProducer error:', err);
    }
  }

  private removeSfuConsumer(producerId: string, producerSocketId: string): void {
    for (const [cId, consumer] of this.sfuConsumers.entries()) {
      if (consumer.producerId === producerId) {
        consumer.close();
        this.sfuConsumers.delete(cId);

        const remoteStream = this.sfuRemoteStreams.get(producerSocketId);
        if (remoteStream) {
          remoteStream.removeTrack(consumer.track);
          const p = this.participants.get(producerSocketId);
          if (p) {
            p.stream = remoteStream;
            this.notifyPeersChange();
          }
        }
      }
    }
  }

  private cleanupSfuParticipant(socketId: string): void {
    this.sfuRemoteStreams.delete(socketId);
  }

  private teardownSfu(): void {
    for (const consumer of this.sfuConsumers.values()) {
      consumer.close();
    }
    this.sfuConsumers.clear();
    this.sfuRemoteStreams.clear();

    if (this.sfuAudioProducer) {
      this.sfuAudioProducer.close();
      this.sfuAudioProducer = null;
    }
    if (this.sfuVideoProducer) {
      this.sfuVideoProducer.close();
      this.sfuVideoProducer = null;
    }
    if (this.sfuSendTransport) {
      this.sfuSendTransport.close();
      this.sfuSendTransport = null;
    }
    if (this.sfuRecvTransport) {
      this.sfuRecvTransport.close();
      this.sfuRecvTransport = null;
    }
    this.sfuDevice = null;
  }

  // ==========================================
  // ADAPTIVE QUALITY, PINNING & TELEMETRY
  // ==========================================

  public pinParticipant(socketId: string | null): void {
    this.pinnedSocketId = socketId;

    // Update participant states
    for (const [sId, p] of this.participants.entries()) {
      p.isPinned = sId === socketId;
    }
    this.notifyPeersChange();

    // If on SFU, adapt spatial and temporal layers
    if (this.topologyMode === 'sfu' && socket) {
      for (const consumer of this.sfuConsumers.values()) {
        if (consumer.kind === 'video') {
          const isTargetPinned = this.pinnedSocketId && this.sfuRemoteStreams.get(this.pinnedSocketId)?.getTracks().includes(consumer.track);
          const spatialLayer = isTargetPinned ? 2 : 0;
          const temporalLayer = isTargetPinned ? 2 : 1;

          socket.emit('sfu:consumer_preferred_layers', {
            consumerId: consumer.id,
            spatialLayer,
            temporalLayer,
          });
        }
      }
    }
  }

  public getPinnedSocketId(): string | null {
    return this.pinnedSocketId;
  }

  public getTopologyMode(): 'idle' | 'p2p' | 'sfu' {
    return this.topologyMode;
  }

  public getNetworkQuality(): NetworkQuality {
    return this.networkQuality;
  }

  private startTelemetry(): void {
    if (this.telemetryInterval) return;

    this.telemetryInterval = setInterval(async () => {
      let rtt = 0;
      let packetLoss = 0;

      try {
        if (this.topologyMode === 'p2p' && this.p2pPeerConnection) {
          const stats = await this.p2pPeerConnection.getStats();
          stats.forEach((report) => {
            if (report.type === 'candidate-pair' && report.state === 'succeeded' && typeof report.currentRoundTripTime === 'number') {
              rtt = Math.round(report.currentRoundTripTime * 1000);
            }
            if (report.type === 'inbound-rtp' && typeof report.packetsLost === 'number' && typeof report.packetsReceived === 'number') {
              const total = report.packetsLost + report.packetsReceived;
              if (total > 0) packetLoss = Math.round((report.packetsLost / total) * 100);
            }
          });
        } else if (this.topologyMode === 'sfu' && this.sfuRecvTransport) {
          const stats = await (this.sfuRecvTransport as any).getStats?.();
          if (stats) {
            stats.forEach((report: any) => {
              if (report.type === 'candidate-pair' && typeof report.currentRoundTripTime === 'number') {
                rtt = Math.round(report.currentRoundTripTime * 1000);
              }
              if (report.type === 'inbound-rtp' && typeof report.packetsLost === 'number' && typeof report.packetsReceived === 'number') {
                const total = report.packetsLost + report.packetsReceived;
                if (total > 0) packetLoss = Math.round((report.packetsLost / total) * 100);
              }
            });
          }
        }

        let state: 'good' | 'unstable' | 'poor' = 'good';
        if (packetLoss > 8 || rtt > 350) {
          state = 'poor';
        } else if (packetLoss >= 2 || rtt >= 150) {
          state = 'unstable';
        }

        this.networkQuality = { state, rtt, packetLoss };
        this.notifyNetworkQuality(this.networkQuality);
      } catch {}
    }, 3000);
  }

  private stopTelemetry(): void {
    if (this.telemetryInterval) {
      clearInterval(this.telemetryInterval);
      this.telemetryInterval = null;
    }
  }

  // ==========================================
  // MEDIA CONTROL & JOIN / LEAVE
  // ==========================================

  public async joinCall(options: { audio: boolean; video: boolean }): Promise<{ success: boolean; error?: string }> {
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        return { success: false, error: 'MediaDevices API not supported on this browser.' };
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: { ideal: true },
          noiseSuppression: { ideal: true },
          autoGainControl: { ideal: true },
          // @ts-ignore
          googEchoCancellation: { ideal: true },
          // @ts-ignore
          googAutoGainControl: { ideal: true },
          // @ts-ignore
          googNoiseSuppression: { ideal: true },
          // @ts-ignore
          googHighpassFilter: { ideal: true },
        },
        video: options.video ? { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' } : false,
      });

      this.localStream = stream;
      this.isInCall = true;
      this.isMuted = !options.audio;
      this.isCameraOff = !options.video;

      this.localStream.getAudioTracks().forEach((t) => (t.enabled = !this.isMuted));
      this.localStream.getVideoTracks().forEach((t) => (t.enabled = !this.isCameraOff));

      // Local participant state
      const localState: CallParticipantState = {
        socketId: (socket && socket.id) ? socket.id : 'local',
        userId: this.localUserId,
        username: this.localUsername,
        avatarId: this.localAvatarId,
        stream: this.localStream,
        isMuted: this.isMuted,
        isCameraOff: this.isCameraOff,
        isScreenSharing: false,
        isSpeaking: false,
        isLocal: true,
        isPinned: false,
        networkQuality: 'good',
      };
      this.participants.set(localState.socketId, localState);
      this.notifyPeersChange();
      this.notifyLocalStream(this.localStream);

      // Start VAD & Telemetry
      this.startAudioActivityDetection();
      this.startTelemetry();

      // Emit call:join
      if (socket) {
        socket.emit('call:join', {
          hasAudio: options.audio,
          hasVideo: options.video,
          isMuted: this.isMuted,
          isCameraOff: this.isCameraOff,
        });
      }

      return { success: true };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Permission denied or media device unavailable.' };
    }
  }

  public leaveCall(): void {
    this.isInCall = false;
    this.teardownP2P();
    this.teardownSfu();
    this.stopAudioActivityDetection();
    this.stopTelemetry();

    if (this.localStream) {
      this.localStream.getTracks().forEach((t) => t.stop());
      this.localStream = null;
    }
    if (this.screenStream) {
      this.screenStream.getTracks().forEach((t) => t.stop());
      this.screenStream = null;
    }

    this.participants.clear();
    this.notifyPeersChange();
    this.notifyLocalStream(null);

    if (socket) {
      socket.emit('call:leave');
    }
  }

  public toggleMute(): boolean {
    this.isMuted = !this.isMuted;
    this.muteLocalAudio(this.isMuted);
    return this.isMuted;
  }

  private muteLocalAudio(mute: boolean): void {
    this.isMuted = mute;
    if (this.localStream) {
      this.localStream.getAudioTracks().forEach((t) => (t.enabled = !mute));
    }
    const local = this.participants.get((socket && socket.id) ? socket.id : 'local');
    if (local) {
      local.isMuted = mute;
      this.notifyPeersChange();
    }
    if (socket) {
      socket.emit('call:media_state', {
        isMuted: this.isMuted,
        isCameraOff: this.isCameraOff,
        isScreenSharing: this.isScreenSharing,
      });
    }
  }

  public async toggleCamera(): Promise<boolean> {
    this.isCameraOff = !this.isCameraOff;

    if (!this.isCameraOff && (!this.localStream || this.localStream.getVideoTracks().length === 0)) {
      try {
        const videoStream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' },
        });
        const newTrack = videoStream.getVideoTracks()[0];
        if (this.localStream && newTrack) {
          this.localStream.addTrack(newTrack);
        }
      } catch (err) {
        console.warn('[HybridCall] Failed to access camera:', err);
        this.isCameraOff = true;
      }
    } else if (this.localStream) {
      this.localStream.getVideoTracks().forEach((t) => (t.enabled = !this.isCameraOff));
    }

    // Update P2P RTCPeerConnection sender with the live video track
    if (this.topologyMode === 'p2p' && this.p2pPeerConnection) {
      const pc = this.p2pPeerConnection;
      const videoTrack = this.localStream?.getVideoTracks()[0];
      const videoSender =
        pc.getSenders().find((s) => s.track?.kind === 'video') ||
        pc.getTransceivers().find((t) => t.receiver.track?.kind === 'video' || t.sender.track?.kind === 'video')?.sender;

      if (videoSender) {
        await videoSender.replaceTrack(!this.isCameraOff && videoTrack ? videoTrack : null).catch((err) => {
          console.warn('[P2P] replaceTrack error:', err);
        });
      } else if (!this.isCameraOff && videoTrack) {
        try {
          pc.addTrack(videoTrack, this.localStream!);
        } catch (err) {
          console.warn('[P2P] addTrack error:', err);
        }
      }
    }

    // If on SFU, handle producer
    if (this.topologyMode === 'sfu' && this.sfuSendTransport) {
      if (this.isCameraOff && this.sfuVideoProducer) {
        this.sfuVideoProducer.pause();
      } else if (!this.isCameraOff && this.sfuVideoProducer) {
        this.sfuVideoProducer.resume();
      } else if (!this.isCameraOff && !this.sfuVideoProducer) {
        await this.publishLocalSfuProducers();
      }
    }

    const local = this.participants.get((socket && socket.id) ? socket.id : 'local');
    if (local) {
      local.isCameraOff = this.isCameraOff;
      local.stream = this.localStream || undefined;
      this.participants.set((socket && socket.id) ? socket.id : 'local', { ...local });
      this.notifyPeersChange();
    }

    if (socket) {
      socket.emit('call:media_state', {
        isMuted: this.isMuted,
        isCameraOff: this.isCameraOff,
        isScreenSharing: this.isScreenSharing,
      });
    }

    return this.isCameraOff;
  }

  public hostMuteUser(targetSocketId: string, targetUserId: string): void {
    if (socket) {
      socket.emit('call:host_mute_user', { targetSocketId, targetUserId });
    }
  }

  public hostStopScreenShare(targetSocketId: string, targetUserId: string): void {
    if (socket) {
      socket.emit('call:host_stop_screenshare', { targetSocketId, targetUserId });
    }
  }

  public stopScreenShare(): void {
    if (this.screenStream) {
      this.screenStream.getTracks().forEach((t) => t.stop());
      this.screenStream = null;
    }
    this.isScreenSharing = false;
  }

  public isCallActive(): boolean {
    return this.isInCall;
  }

  public getLocalMediaState() {
    return {
      isMuted: this.isMuted,
      isCameraOff: this.isCameraOff,
      isScreenSharing: this.isScreenSharing,
    };
  }

  // ==========================================
  // VAD (Voice Activity Detection)
  // ==========================================

  private startAudioActivityDetection(): void {
    if (!this.localStream) return;
    try {
      const AudioCtx = (typeof window !== 'undefined' && (window.AudioContext || (window as any).webkitAudioContext)) || (globalThis as any).AudioContext;
      if (!AudioCtx) return;

      const ctx = new AudioCtx();
      this.audioContext = ctx;
      const source = ctx.createMediaStreamSource(this.localStream);
      const analyserNode = ctx.createAnalyser();
      analyserNode.fftSize = 256;
      source.connect(analyserNode);
      this.analyser = analyserNode;

      const dataArray = new Uint8Array(analyserNode.frequencyBinCount);

      this.vadInterval = setInterval(() => {
        if (!this.analyser || this.isMuted) {
          if (this.wasSpeaking) {
            this.wasSpeaking = false;
            this.emitSpeaking(false);
          }
          return;
        }

        this.analyser.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          sum += dataArray[i];
        }
        const avg = sum / dataArray.length;
        const isSpeaking = avg > 20;

        if (isSpeaking !== this.wasSpeaking) {
          this.wasSpeaking = isSpeaking;
          this.emitSpeaking(isSpeaking);
        }
      }, 150);
    } catch {}
  }

  private stopAudioActivityDetection(): void {
    if (this.vadInterval) {
      clearInterval(this.vadInterval);
      this.vadInterval = null;
    }
    if (this.audioContext) {
      this.audioContext.close().catch(() => {});
      this.audioContext = null;
      this.analyser = null;
    }
  }

  private emitSpeaking(isSpeaking: boolean): void {
    const local = this.participants.get((socket && socket.id) ? socket.id : 'local');
    if (local) {
      local.isSpeaking = isSpeaking;
      this.notifyPeersChange();
    }
    if (socket) {
      socket.emit('call:speaking', { isSpeaking });
    }
  }

  // ==========================================
  // SUBSCRIPTIONS
  // ==========================================

  public subscribePeers(cb: PeersChangeCallback): () => void {
    this.onPeersChangeCallbacks.add(cb);
    cb(Array.from(this.participants.values()));
    return () => this.onPeersChangeCallbacks.delete(cb);
  }

  public subscribeLocalStream(cb: LocalStreamCallback): () => void {
    this.onLocalStreamCallbacks.add(cb);
    cb(this.localStream);
    return () => this.onLocalStreamCallbacks.delete(cb);
  }

  public subscribeSpeaking(cb: SpeakingCallback): () => void {
    this.onSpeakingCallbacks.add(cb);
    return () => this.onSpeakingCallbacks.delete(cb);
  }

  public subscribeCallCount(cb: CallCountCallback): () => void {
    this.onCallCountCallbacks.add(cb);
    return () => this.onCallCountCallbacks.delete(cb);
  }

  public subscribeForceMuted(cb: (mutedBy: string) => void): () => void {
    this.onForceMutedCallbacks.add(cb);
    return () => this.onForceMutedCallbacks.delete(cb);
  }

  public subscribeTopology(cb: TopologyCallback): () => void {
    this.onTopologyCallbacks.add(cb);
    cb(this.topologyMode);
    return () => this.onTopologyCallbacks.delete(cb);
  }

  public subscribeNetworkQuality(cb: NetworkQualityCallback): () => void {
    this.onNetworkQualityCallbacks.add(cb);
    cb(this.networkQuality);
    return () => this.onNetworkQualityCallbacks.delete(cb);
  }

  private notifyPeersChange(): void {
    const list = Array.from(this.participants.values());
    this.onPeersChangeCallbacks.forEach((cb) => cb(list));
  }

  private notifyLocalStream(stream: MediaStream | null): void {
    this.onLocalStreamCallbacks.forEach((cb) => cb(stream));
  }

  private notifySpeaking(socketId: string, isSpeaking: boolean): void {
    this.onSpeakingCallbacks.forEach((cb) => cb(socketId, isSpeaking));
  }

  private notifyCallCount(count: number): void {
    this.onCallCountCallbacks.forEach((cb) => cb(count));
  }

  private notifyTopology(mode: 'idle' | 'p2p' | 'sfu'): void {
    this.onTopologyCallbacks.forEach((cb) => cb(mode));
  }

  private notifyNetworkQuality(quality: NetworkQuality): void {
    this.onNetworkQualityCallbacks.forEach((cb) => cb(quality));
  }
}

export const hybridCallManager = new HybridCallManager();
