import React from 'react';
import { AlertCircle, Chrome, CheckCircle2, RefreshCw } from 'lucide-react';
import type { MediaIdentity } from '../types.js';

interface ExtensionStatusBannerProps {
  extensionInstalled: boolean;
  partyMedia: MediaIdentity | null;
  activeTabMedia: MediaIdentity | null;
  onOpenPartyMedia?: () => void;
  onSyncTab?: () => void;
}

export const ExtensionStatusBanner: React.FC<ExtensionStatusBannerProps> = ({
  extensionInstalled,
  partyMedia,
  activeTabMedia,
  onOpenPartyMedia,
  onSyncTab,
}) => {
  // If active tab media doesn't match room media
  const hasMismatch =
    extensionInstalled &&
    partyMedia &&
    activeTabMedia &&
    (partyMedia.platform !== activeTabMedia.platform || partyMedia.mediaId !== activeTabMedia.mediaId);

  if (hasMismatch) {
    return (
      <div className="flex items-center justify-between p-3 mb-3 bg-amber-500/10 border border-amber-500/30 rounded-xl text-amber-200 text-xs animate-fade-in">
        <div className="flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
          <div>
            <span className="font-semibold">Media Mismatch:</span> Your browser tab is on{' '}
            <span className="underline">{activeTabMedia?.title || activeTabMedia?.mediaId}</span>, but the party is watching{' '}
            <span className="font-semibold">{partyMedia?.title || partyMedia?.mediaId}</span>.
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {onOpenPartyMedia && (
            <button
              onClick={onOpenPartyMedia}
              className="px-2.5 py-1 bg-amber-500 hover:bg-amber-600 text-slate-950 font-semibold rounded-lg transition"
            >
              Open Party Media
            </button>
          )}
          {onSyncTab && (
            <button
              onClick={onSyncTab}
              className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-amber-200 border border-amber-500/30 rounded-lg transition flex items-center gap-1"
            >
              <RefreshCw className="w-3 h-3" />
              Sync
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between px-3 py-1.5 mb-3 bg-slate-900/60 border border-slate-800/80 rounded-xl text-xs text-slate-400">
      <div className="flex items-center gap-2">
        <Chrome className="w-3.5 h-3.5 text-purple-400" />
        <span>
          SyncTube V2 Extension:{' '}
          <span className={extensionInstalled ? 'text-emerald-400 font-semibold' : 'text-slate-400'}>
            {extensionInstalled ? 'Connected & Active' : 'Extension ready for tab sync'}
          </span>
        </span>
      </div>
      <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
        <CheckCircle2 className="w-3 h-3 text-cyan-400" />
        <span>Universal Platform Sync</span>
      </div>
    </div>
  );
};
