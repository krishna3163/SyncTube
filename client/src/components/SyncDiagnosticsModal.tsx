import React from 'react';
import { X, Activity, Server, Radio, Zap, ShieldCheck } from 'lucide-react';
import type { UniversalPlaybackState, DriftAssessment } from '../types.js';

interface SyncDiagnosticsModalProps {
  isOpen: boolean;
  onClose: () => void;
  syncState: UniversalPlaybackState | null;
  driftAssessment: DriftAssessment | null;
  rttMs: number;
  connectionStatus: string;
}

export const SyncDiagnosticsModal: React.FC<SyncDiagnosticsModalProps> = ({
  isOpen,
  onClose,
  syncState,
  driftAssessment,
  rttMs,
  connectionStatus,
}) => {
  if (!isOpen) return null;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card diagnostics-modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="diagnostics-modal-header-title">
            <Activity size={18} color="var(--accent-cyan)" />
            <h2>Sync Diagnostics & Telemetry</h2>
          </div>
          <button
            onClick={onClose}
            className="modal-close-btn"
            title="Close modal"
            aria-label="Close modal"
          >
            <X size={18} />
          </button>
        </div>

        <div className="modal-body diagnostics-modal-body">
          <div className="diagnostics-grid">
            {/* Connection Status */}
            <div className="diagnostics-metric-card">
              <div className="diagnostics-metric-header">
                <Radio size={14} color="var(--green)" />
                <span>Connection</span>
              </div>
              <p className="diagnostics-metric-value text-green capitalize">{connectionStatus}</p>
            </div>

            {/* Network Latency RTT */}
            <div className="diagnostics-metric-card">
              <div className="diagnostics-metric-header">
                <Zap size={14} color="var(--accent)" />
                <span>RTT Latency</span>
              </div>
              <p className="diagnostics-metric-value">{Math.round(rttMs)} ms</p>
            </div>

            {/* Playback Drift */}
            <div className="diagnostics-metric-card">
              <div className="diagnostics-metric-header">
                <Activity size={14} color="var(--accent-cyan)" />
                <span>Clock Drift</span>
              </div>
              <p className={`diagnostics-metric-value ${Math.abs(driftAssessment?.driftMs || 0) < 250 ? 'text-green' : 'text-amber'}`}>
                {driftAssessment ? `${Math.round(driftAssessment.driftMs)} ms` : '< 100 ms'}
              </p>
            </div>

            {/* State Revision */}
            <div className="diagnostics-metric-card">
              <div className="diagnostics-metric-header">
                <Server size={14} color="#c084fc" />
                <span>State Revision</span>
              </div>
              <p className="diagnostics-metric-value text-purple">rev #{syncState?.revision ?? 0}</p>
            </div>
          </div>

          {/* Universal Protocol Details */}
          <div className="diagnostics-protocol-card">
            <div className="diagnostics-protocol-title">
              <ShieldCheck size={16} color="#c084fc" />
              <span>Universal Sync Protocol State</span>
            </div>
            <div className="diagnostics-protocol-list">
              <div className="diagnostics-protocol-row">
                <span className="label">Platform:</span>
                <span className="val uppercase">{syncState?.mediaIdentity?.platform || 'YouTube'}</span>
              </div>
              <div className="diagnostics-protocol-row">
                <span className="label">Media Identity:</span>
                <span className="val mono">{syncState?.mediaIdentity?.mediaId || 'none'}</span>
              </div>
              <div className="diagnostics-protocol-row">
                <span className="label">Playback State:</span>
                <span className="val text-green">{syncState?.state || 'PAUSED'}</span>
              </div>
              <div className="diagnostics-protocol-row">
                <span className="label">Playback Rate:</span>
                <span className="val">{syncState?.playbackRate || 1.0}x</span>
              </div>
              <div className="diagnostics-protocol-row">
                <span className="label">Drift Resolution:</span>
                <span className="val capitalize">
                  {driftAssessment?.action ? driftAssessment.action.replace(/_/g, ' ') : 'Authoritative in-sync'}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
