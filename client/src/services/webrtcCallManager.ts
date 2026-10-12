import { socket } from './socket.js';

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
}

const ICE_SERVERS: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun.services.mozilla.com' },
  ],
};

type PeersChangeCallback = (peers: CallParticipantState[]) => void;
type LocalStreamCallback = (stream: MediaStream | null) => void;
type SpeakingCallback = (socketId: string, isSpeaking: boolean) => void;
type CallCountCallback = (count: number) => void;

class WebRtcCallManager {
  private localStream: MediaStream | null = null;
  private screenStream: MediaStream | null = null;
  private peerConnections: Map<string, RTCPeerConnection> = new Map();
  private participants: Map<string, CallParticipantState> = new Map();

  private isMuted: boolean = false;
  private isCameraOff: boolean = true;
  private isScreenSharing: boolean = false;
  private isInCall: boolean = false;

  private localUserId: string = '';
  private localUsername: string = '';
  private localAvatarId?: string;

  private onPeersChangeCallbacks: Set<PeersChangeCallback> = new Set();
  private onLocalStreamCallbacks: Set<LocalStreamCallback> = new Set();
  private onSpeakingCallbacks: Set<SpeakingCallback> = new Set();
  private onCallCountCallbacks: Set<CallCountCallback> = new Set();
  private onForceMutedCallbacks: Set<(mutedBy: string) => void> = new Set();

  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private vadInterval: number | null = null;
  private wasSpeaking: boolean = false;

  constructor() {
    this.setupSocketListeners();
  }

  public setLocalUser(userId: string, username: string, avatarId?: string) {
    this.localUserId = userId;
    this.localUsername = username;
    this.localAvatarId = avatarId;
  }

  public subscribePeers(cb: PeersChangeCallback): () => void {
    this.onPeersChangeCallbacks.add(cb);
    cb(this.getParticipantsList());
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

  public getParticipantsList(): CallParticipantState[] {
    const list = Array.from(this.participants.values());
    if (this.isInCall) {
      list.unshift({
        socketId: socket.id || 'local',
        userId: this.localUserId,
        username: this.localUsername,
        avatarId: this.localAvatarId,
        stream: this.screenStream || this.localStream || undefined,
        isMuted: this.isMuted,
        isCameraOff: this.isCameraOff,
        isScreenSharing: this.isScreenSharing,
        isSpeaking: this.wasSpeaking,
        isLocal: true,
      });
    }
    return list;
  }

  public getCallCount(): number {
    return this.participants.size + (this.isInCall ? 1 : 0);
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

  /**
   * Adaptive media constraint calculator:
   * - 2 users (1-to-1 P2P): high quality 720p/30fps
   * - 3-6 users (Mesh P2P): efficient 480p/24fps
   * - >6 users (Adaptive Mode): optimized 360p/15fps to protect movie streaming bandwidth
   */
  private getAdaptiveVideoConstraints(peerCount: number): MediaTrackConstraints | boolean {
    if (peerCount <= 1) {
      return { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } };
    }
    if (peerCount <= 5) {
      return { width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 24 } };
    }
    return { width: { ideal: 480 }, height: { ideal: 360 }, frameRate: { ideal: 15 } };
  }

  public async joinCall(options: { audio?: boolean; video?: boolean } = {}): Promise<{ success: boolean; error?: string }> {
    if (this.isInCall) return { success: true };

    const requestAudio = options.audio ?? true;
    const requestVideo = options.video ?? false;

    if (typeof navigator === 'undefined' || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      if (typeof window !== 'undefined' && !window.isSecureContext) {
        return { success: false, error: 'SECURE_CONTEXT_REQUIRED' };
      }
      return { success: false, error: 'MEDIA_DEVICES_NOT_SUPPORTED' };
    }

    try {
      const constraints: MediaStreamConstraints = {
        audio: requestAudio
          ? {
              echoCancellation: true,
              noiseSuppression: true,
              autoGainControl: true,
            }
          : false,
        video: requestVideo ? this.getAdaptiveVideoConstraints(this.participants.size) : false,
      };

      try {
        this.localStream = await navigator.mediaDevices.getUserMedia(constraints);
      } catch (firstErr: any) {
        console.warn('[SyncTube WebRTC] Primary constraints failed, retrying with simple constraints:', firstErr);
        if (firstErr?.name === 'NotAllowedError' || firstErr?.name === 'PermissionDeniedError') {
          return { success: false, error: 'PERMISSION_DENIED' };
        }

        try {
          this.localStream = await navigator.mediaDevices.getUserMedia({
            audio: requestAudio,
            video: requestVideo ? true : false,
          });
        } catch (secondErr: any) {
          if (secondErr?.name === 'NotAllowedError' || secondErr?.name === 'PermissionDeniedError') {
            return { success: false, error: 'PERMISSION_DENIED' };
          }
          if (requestAudio) {
            console.warn('[SyncTube WebRTC] Falling back to audio-only stream');
            this.localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
          } else {
            return { success: false, error: secondErr?.message || 'Failed to access media devices' };
          }
        }
      }

      this.isMuted = !requestAudio;
      this.isCameraOff = !requestVideo || !this.localStream.getVideoTracks().length;
      this.isInCall = true;

      // Start voice activity detection for speaking indicator
      this.initVoiceActivityDetection();

      this.notifyLocalStream();

      // Emit join event to room
      socket.emit('call:join', {
        hasAudio: requestAudio,
        hasVideo: !this.isCameraOff,
        isMuted: this.isMuted,
        isCameraOff: this.isCameraOff,
      });

      this.notifyPeers();
      return { success: true };
    } catch (err: any) {
      console.error('[SyncTube WebRTC] Failed to join call:', err);
      if (err?.name === 'NotAllowedError' || err?.name === 'PermissionDeniedError') {
        return { success: false, error: 'PERMISSION_DENIED' };
      }
      return { success: false, error: err?.message || 'Could not access microphone/camera' };
    }
  }

  public leaveCall(): void {
    if (!this.isInCall) return;

    this.isInCall = false;

    // Stop VAD
    if (this.vadInterval) {
      window.clearInterval(this.vadInterval);
      this.vadInterval = null;
    }
    if (this.audioContext) {
      this.audioContext.close().catch(() => {});
      this.audioContext = null;
    }

    // Stop local tracks
    if (this.localStream) {
      this.localStream.getTracks().forEach((track) => track.stop());
      this.localStream = null;
    }
    if (this.screenStream) {
      this.screenStream.getTracks().forEach((track) => track.stop());
      this.screenStream = null;
    }

    // Close all peer connections
    for (const [socketId, pc] of this.peerConnections) {
      pc.close();
    }
    this.peerConnections.clear();
    this.participants.clear();

    socket.emit('call:leave');

    this.notifyLocalStream();
    this.notifyPeers();
  }

  public toggleMute(): boolean {
    if (!this.localStream) return this.isMuted;
    const audioTrack = this.localStream.getAudioTracks()[0];
    if (audioTrack) {
      audioTrack.enabled = !audioTrack.enabled;
      this.isMuted = !audioTrack.enabled;
      this.broadcastMediaState();
      this.notifyPeers();
    }
    return this.isMuted;
  }

  public muteLocalAudio(forceMute = true): boolean {
    if (!this.localStream) {
      this.isMuted = true;
      return true;
    }
    const audioTracks = this.localStream.getAudioTracks();
    audioTracks.forEach((track) => {
      track.enabled = !forceMute;
    });
    this.isMuted = forceMute;
    this.broadcastMediaState();
    this.notifyPeers();
    return this.isMuted;
  }

  public hostMuteUser(targetSocketId?: string, targetUserId?: string) {
    socket.emit('call:host_mute_user', { targetSocketId, targetUserId });
  }

  public async toggleCamera(): Promise<boolean> {
    if (!this.isInCall) return this.isCameraOff;

    if (this.isCameraOff) {
      try {
        // Turn camera ON
        const videoStream = await navigator.mediaDevices.getUserMedia({
          video: this.getAdaptiveVideoConstraints(this.participants.size),
        });
        const newVideoTrack = videoStream.getVideoTracks()[0];

        if (this.localStream) {
          this.localStream.addTrack(newVideoTrack);
        } else {
          this.localStream = videoStream;
        }

        // Add or replace track on all peer connections
        for (const pc of this.peerConnections.values()) {
          const sender = pc.getSenders().find((s) => s.track?.kind === 'video');
          if (sender) {
            sender.replaceTrack(newVideoTrack);
          } else {
            pc.addTrack(newVideoTrack, this.localStream);
          }
        }

        this.isCameraOff = false;
      } catch (err) {
        console.warn('[SyncTube WebRTC] Could not enable camera:', err);
        return true;
      }
    } else {
      // Turn camera OFF
      if (this.localStream) {
        const videoTrack = this.localStream.getVideoTracks()[0];
        if (videoTrack) {
          videoTrack.stop();
          this.localStream.removeTrack(videoTrack);
        }
      }
      for (const pc of this.peerConnections.values()) {
        const sender = pc.getSenders().find((s) => s.track?.kind === 'video');
        if (sender) {
          pc.removeTrack(sender);
        }
      }
      this.isCameraOff = true;
    }

    this.broadcastMediaState();
    this.notifyLocalStream();
    this.notifyPeers();
    return this.isCameraOff;
  }

  public async toggleScreenShare(): Promise<boolean> {
    if (!this.isInCall) return false;

    if (this.isScreenSharing) {
      // Stop screen share
      if (this.screenStream) {
        this.screenStream.getTracks().forEach((t) => t.stop());
        this.screenStream = null;
      }
      this.isScreenSharing = false;

      // Restore camera if active
      const cameraTrack = this.localStream?.getVideoTracks()[0];
      for (const pc of this.peerConnections.values()) {
        const sender = pc.getSenders().find((s) => s.track?.kind === 'video');
        if (sender) {
          if (cameraTrack) {
            sender.replaceTrack(cameraTrack);
          } else {
            pc.removeTrack(sender);
          }
        }
      }
    } else {
      try {
        const stream = await navigator.mediaDevices.getDisplayMedia({
          video: { frameRate: { ideal: 30 } },
          audio: true,
        });
        this.screenStream = stream;
        this.isScreenSharing = true;

        const screenTrack = stream.getVideoTracks()[0];
        screenTrack.onended = () => {
          this.toggleScreenShare();
        };

        // Replace track on all peers
        for (const pc of this.peerConnections.values()) {
          const sender = pc.getSenders().find((s) => s.track?.kind === 'video');
          if (sender) {
            sender.replaceTrack(screenTrack);
          } else {
            pc.addTrack(screenTrack, stream);
          }
        }
      } catch {
        return false;
      }
    }

    this.broadcastMediaState();
    this.notifyLocalStream();
    this.notifyPeers();
    return this.isScreenSharing;
  }

  private broadcastMediaState() {
    socket.emit('call:media_state', {
      isMuted: this.isMuted,
      isCameraOff: this.isCameraOff,
      isScreenSharing: this.isScreenSharing,
    });
  }

  private initVoiceActivityDetection() {
    if (!this.localStream || this.audioContext) return;
    try {
      const audioTrack = this.localStream.getAudioTracks()[0];
      if (!audioTrack) return;

      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      this.audioContext = new AudioCtx();
      const source = this.audioContext.createMediaStreamSource(this.localStream);
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 256;
      source.connect(this.analyser);

      const buffer = new Uint8Array(this.analyser.frequencyBinCount);

      this.vadInterval = window.setInterval(() => {
        if (!this.analyser || this.isMuted) {
          if (this.wasSpeaking) {
            this.wasSpeaking = false;
            this.notifySpeaking(socket.id || 'local', false);
            socket.emit('call:speaking', { isSpeaking: false });
          }
          return;
        }

        this.analyser.getByteFrequencyData(buffer);
        let sum = 0;
        for (let i = 0; i < buffer.length; i++) {
          sum += buffer[i];
        }
        const average = sum / buffer.length;
        const isSpeaking = average > 18; // speaking threshold

        if (isSpeaking !== this.wasSpeaking) {
          this.wasSpeaking = isSpeaking;
          this.notifySpeaking(socket.id || 'local', isSpeaking);
          socket.emit('call:speaking', { isSpeaking });
        }
      }, 200);
    } catch {
      // AudioContext not permitted or VAD unavailable
    }
  }

  private setupSocketListeners() {
    // 1. Existing participants when local user joins call
    socket.on('call:existing_participants', async (data: { participants: any[] }) => {
      if (!this.isInCall) return;

      for (const p of data.participants || []) {
        if (p.socketId === socket.id) continue;

        this.participants.set(p.socketId, {
          socketId: p.socketId,
          userId: p.userId,
          username: p.username,
          avatarId: p.avatarId,
          isMuted: p.isMuted ?? false,
          isCameraOff: p.isCameraOff ?? true,
          isScreenSharing: p.isScreenSharing ?? false,
          isSpeaking: false,
        });

        // Initiate P2P WebRTC connection to existing participant
        await this.createPeerConnection(p.socketId, true);
      }
      this.notifyPeers();
    });

    // 2. A new user joined the call
    socket.on('call:user_joined', async (p: any) => {
      if (p.socketId === socket.id) return;

      this.participants.set(p.socketId, {
        socketId: p.socketId,
        userId: p.userId,
        username: p.username,
        avatarId: p.avatarId,
        isMuted: p.isMuted ?? false,
        isCameraOff: p.isCameraOff ?? true,
        isScreenSharing: p.isScreenSharing ?? false,
        isSpeaking: false,
      });

      // Prepare to receive call offer from newcomer
      await this.createPeerConnection(p.socketId, false);
      this.notifyPeers();
    });

    // 3. User left the call
    socket.on('call:user_left', (data: { socketId: string }) => {
      const pc = this.peerConnections.get(data.socketId);
      if (pc) {
        pc.close();
        this.peerConnections.delete(data.socketId);
      }
      this.participants.delete(data.socketId);
      this.notifyPeers();
    });

    // 4. Remote media state updated (mute / camera toggle)
    socket.on('call:user_media_state', (data: any) => {
      const p = this.participants.get(data.socketId);
      if (p) {
        p.isMuted = data.isMuted;
        p.isCameraOff = data.isCameraOff;
        p.isScreenSharing = data.isScreenSharing;
        this.notifyPeers();
      }
    });

    // 5. Remote user speaking indicator
    socket.on('call:user_speaking', (data: { socketId: string; isSpeaking: boolean }) => {
      const p = this.participants.get(data.socketId);
      if (p) {
        p.isSpeaking = data.isSpeaking;
        this.notifySpeaking(data.socketId, data.isSpeaking);
        this.notifyPeers();
      }
    });

    // 6. Overall room call count update
    socket.on('call:participants_updated', (data: { count: number }) => {
      for (const cb of this.onCallCountCallbacks) {
        cb(data.count);
      }
    });

    // 7. WebRTC Signaling Relays
    socket.on('webrtc:offer', async (data: { fromSocketId: string; offer: RTCSessionDescriptionInit }) => {
      await this.handleOffer(data.fromSocketId, data.offer);
    });

    socket.on('webrtc:answer', async (data: { fromSocketId: string; answer: RTCSessionDescriptionInit }) => {
      await this.handleAnswer(data.fromSocketId, data.answer);
    });

    socket.on('webrtc:ice_candidate', async (data: { fromSocketId: string; candidate: RTCIceCandidateInit }) => {
      await this.handleIceCandidate(data.fromSocketId, data.candidate);
    });

    // 8. Remote Force Mute by Host
    socket.on('call:force_muted', (data: { mutedBy?: string }) => {
      const mutedBy = data?.mutedBy || 'Host';
      this.muteLocalAudio(true);
      for (const cb of this.onForceMutedCallbacks) {
        cb(mutedBy);
      }
    });
  }

  private async createPeerConnection(targetSocketId: string, isInitiator: boolean): Promise<RTCPeerConnection> {
    if (this.peerConnections.has(targetSocketId)) {
      return this.peerConnections.get(targetSocketId)!;
    }

    const pc = new RTCPeerConnection(ICE_SERVERS);
    this.peerConnections.set(targetSocketId, pc);

    // Send local tracks
    const activeStream = this.screenStream || this.localStream;
    if (activeStream) {
      activeStream.getTracks().forEach((track) => {
        pc.addTrack(track, activeStream);
      });
    }

    // Handle incoming remote media tracks
    pc.ontrack = (event) => {
      const remoteStream = event.streams[0] || new MediaStream([event.track]);
      const p = this.participants.get(targetSocketId);
      if (p) {
        p.stream = remoteStream;
        this.notifyPeers();
      }
    };

    // Send ICE candidates to target peer
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        socket.emit('webrtc:ice_candidate', {
          targetSocketId,
          candidate: event.candidate,
        });
      }
    };

    // Connection state logging & reconnection
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
        console.warn(`[SyncTube WebRTC] Connection with ${targetSocketId} state:`, pc.connectionState);
      }
    };

    if (isInitiator) {
      try {
        const offer = await pc.createOffer({
          offerToReceiveAudio: true,
          offerToReceiveVideo: true,
        });
        await pc.setLocalDescription(offer);
        socket.emit('webrtc:offer', {
          targetSocketId,
          offer,
        });
      } catch (err) {
        console.error('[SyncTube WebRTC] Error creating offer:', err);
      }
    }

    return pc;
  }

  private async handleOffer(fromSocketId: string, offer: RTCSessionDescriptionInit): Promise<void> {
    try {
      let pc = this.peerConnections.get(fromSocketId);
      if (!pc) {
        pc = await this.createPeerConnection(fromSocketId, false);
      }
      await pc.setRemoteDescription(new RTCSessionDescription(offer));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      socket.emit('webrtc:answer', {
        targetSocketId: fromSocketId,
        answer,
      });
    } catch (err) {
      console.error('[SyncTube WebRTC] Error handling offer:', err);
    }
  }

  private async handleAnswer(fromSocketId: string, answer: RTCSessionDescriptionInit): Promise<void> {
    try {
      const pc = this.peerConnections.get(fromSocketId);
      if (pc && pc.signalingState !== 'stable') {
        await pc.setRemoteDescription(new RTCSessionDescription(answer));
      }
    } catch (err) {
      console.error('[SyncTube WebRTC] Error handling answer:', err);
    }
  }

  private async handleIceCandidate(fromSocketId: string, candidate: RTCIceCandidateInit): Promise<void> {
    try {
      const pc = this.peerConnections.get(fromSocketId);
      if (pc && pc.remoteDescription) {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      }
    } catch (err) {
      console.error('[SyncTube WebRTC] Error adding ICE candidate:', err);
    }
  }

  private notifyPeers(): void {
    const list = this.getParticipantsList();
    for (const cb of this.onPeersChangeCallbacks) {
      cb(list);
    }
  }

  private notifyLocalStream(): void {
    const stream = this.screenStream || this.localStream;
    for (const cb of this.onLocalStreamCallbacks) {
      cb(stream);
    }
  }

  private notifySpeaking(socketId: string, isSpeaking: boolean): void {
    for (const cb of this.onSpeakingCallbacks) {
      cb(socketId, isSpeaking);
    }
  }
}

export const webrtcCallManager = new WebRtcCallManager();
