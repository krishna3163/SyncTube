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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in">
      <div className="relative w-full max-w-lg p-6 bg-slate-900/95 border border-slate-700/60 rounded-2xl shadow-2xl">
        <div className="flex items-center justify-between pb-4 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <Activity className="w-5 h-5 text-cyan-400" />
            <h2 className="text-lg font-bold text-white">Sync Diagnostics & Telemetry</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="py-4 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            {/* Connection Status */}
            <div className="p-3 bg-slate-950/60 border border-slate-800 rounded-xl">
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-400 mb-1">
                <Radio className="w-3.5 h-3.5 text-emerald-400" />
                Connection
              </div>
              <p className="text-base font-bold text-emerald-400 capitalize">{connectionStatus}</p>
            </div>

            {/* Network Latency RTT */}
            <div className="p-3 bg-slate-950/60 border border-slate-800 rounded-xl">
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-400 mb-1">
                <Zap className="w-3.5 h-3.5 text-amber-400" />
                RTT Latency
              </div>
              <p className="text-base font-bold text-white">{Math.round(rttMs)} ms</p>
            </div>

            {/* Playback Drift */}
            <div className="p-3 bg-slate-950/60 border border-slate-800 rounded-xl">
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-400 mb-1">
                <Activity className="w-3.5 h-3.5 text-cyan-400" />
                Clock Drift
              </div>
              <p className={`text-base font-bold ${Math.abs(driftAssessment?.driftMs || 0) < 250 ? 'text-emerald-400' : 'text-amber-400'}`}>
                {driftAssessment ? `${Math.round(driftAssessment.driftMs)} ms` : '< 100 ms'}
              </p>
            </div>

            {/* State Revision */}
            <div className="p-3 bg-slate-950/60 border border-slate-800 rounded-xl">
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-400 mb-1">
                <Server className="w-3.5 h-3.5 text-purple-400" />
                State Revision
              </div>
              <p className="text-base font-bold text-purple-400">rev #{syncState?.revision ?? 0}</p>
            </div>
          </div>

          {/* Universal Protocol Details */}
          <div className="p-3.5 bg-slate-950/60 border border-slate-800 rounded-xl space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-purple-400" />
              Universal Sync Protocol State
            </h3>
            <div className="text-xs space-y-1.5 text-slate-300">
              <div className="flex justify-between">
                <span className="text-slate-400">Platform:</span>
                <span className="font-semibold text-white uppercase">{syncState?.mediaIdentity?.platform || 'YouTube'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Media Identity:</span>
                <span className="font-mono text-cyan-300 truncate max-w-[220px]">
                  {syncState?.mediaIdentity?.mediaId || 'none'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Playback State:</span>
                <span className="font-semibold text-emerald-400">{syncState?.state || 'PAUSED'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Playback Rate:</span>
                <span className="text-white">{syncState?.playbackRate || 1.0}x</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Drift Resolution:</span>
                <span className="text-slate-300 capitalize">
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
