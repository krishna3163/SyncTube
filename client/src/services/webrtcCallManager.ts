/**
 * WebRtcCallManager Compatibility Layer
 * Re-exports the production HybridCallManager (P2P 1-to-1 + Mediasoup SFU for group calls)
 */
export * from './hybridCallManager.js';
export { hybridCallManager as webrtcCallManager } from './hybridCallManager.js';
