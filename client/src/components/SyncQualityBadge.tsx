import React, { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { SyncStatePayload } from '../types.js';

interface SyncQualityBadgeProps {
  syncState: SyncStatePayload | null;
  currentTime: number;
  isConnected: boolean;
  onResync?: () => void;
}

export const SyncQualityBadge: React.FC<SyncQualityBadgeProps> = ({
  syncState,
  currentTime,
  isConnected,
  onResync,
}) => {
  const [showDetails, setShowDetails] = useState(false);
  const [, setRefreshTick] = useState(0);

  useEffect(() => {
    const refreshTimer = window.setInterval(() => {
      setRefreshTick((tick) => tick + 1);
    }, 250);

    return () => window.clearInterval(refreshTimer);
  }, []);

  if (!isConnected) {
    return (
      <div className="sync-badge sync-disconnected" title="Connection lost. Reconnecting...">
        <span className="sync-dot dot-red" />
        <span className="sync-text">Reconnecting...</span>
      </div>
    );
  }

  // Calculate approximate drift between player currentTime and server expected time
  let driftSeconds = 0;
  if (syncState) {
    let expected = syncState.currentTime;
    if (syncState.playState === 'playing') {
      const elapsed = (Date.now() - syncState.updatedAt) / 1000;
      expected += elapsed;
    }
    driftSeconds = Math.abs(currentTime - expected);
  }

  const isTightSync = driftSeconds < 0.6;
  const driftDisplay = `${driftSeconds < 1 ? driftSeconds.toFixed(2) : driftSeconds.toFixed(1)}s`;

  return (
    <div
      className={`sync-badge ${isTightSync ? 'sync-good' : 'sync-warning'}`}
      onClick={() => setShowDetails((p) => !p)}
      title="Click for sync health details"
    >
      <span className={`sync-dot ${isTightSync ? 'dot-green' : 'dot-yellow'}`} />
      <span className="sync-text">
        {isTightSync ? `Synced (${driftDisplay})` : `Drift: ${driftDisplay}`}
      </span>
      {onResync && !isTightSync && (
        <button
          type="button"
          className="sync-quick-fix-btn"
          onClick={(e) => {
            e.stopPropagation();
            onResync();
          }}
          title="Force Resync"
        >
          <RefreshCw size={12} />
        </button>
      )}

      {showDetails && (
        <div className="sync-details-popup glass-panel">
          <div className="sync-details-row">
            <span className="sync-label">Sync Health:</span>
            <span className={`sync-val ${isTightSync ? 'val-good' : 'val-warn'}`}>
              {isTightSync ? 'Excellent' : 'Adjusting'}
            </span>
          </div>
          <div className="sync-details-row">
            <span className="sync-label">Server State:</span>
            <span className="sync-val">{syncState?.playState?.toUpperCase() || 'PAUSED'}</span>
          </div>
          <div className="sync-details-row">
            <span className="sync-label">Drift Offset:</span>
            <span className="sync-val">{driftDisplay}</span>
          </div>
          {onResync && (
            <button
              type="button"
              className="btn btn-secondary btn-sm sync-details-resync-btn"
              onClick={(e) => {
                e.stopPropagation();
                onResync();
                setShowDetails(false);
              }}
            >
              <RefreshCw size={13} />
              <span>Resync Frame</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
};
