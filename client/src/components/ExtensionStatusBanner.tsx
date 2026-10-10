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
      <div className="extension-status-banner extension-status-banner-mismatch">
        <div className="extension-banner-left">
          <AlertCircle size={16} className="extension-icon-alert" />
          <div className="extension-banner-text">
            <strong>Media Mismatch:</strong> Your browser tab is on{' '}
            <span className="extension-media-title">{activeTabMedia?.title || activeTabMedia?.mediaId}</span>, but the party is watching{' '}
            <strong>{partyMedia?.title || partyMedia?.mediaId}</strong>.
          </div>
        </div>
        <div className="extension-banner-actions">
          {onOpenPartyMedia && (
            <button
              onClick={onOpenPartyMedia}
              className="btn btn-primary btn-sm"
            >
              Open Party Media
            </button>
          )}
          {onSyncTab && (
            <button
              onClick={onSyncTab}
              className="btn btn-secondary btn-sm"
            >
              <RefreshCw size={12} />
              <span>Sync</span>
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="extension-status-banner extension-status-banner-ready">
      <div className="extension-banner-left">
        <Chrome size={15} className="extension-icon-chrome" />
        <span className="extension-banner-text">
          SyncTube V2 Extension:{' '}
          <span className={extensionInstalled ? 'extension-badge-active' : 'extension-badge-idle'}>
            {extensionInstalled ? 'Connected & Active' : 'Extension ready for tab sync'}
          </span>
        </span>
      </div>
      <div className="extension-banner-right">
        <CheckCircle2 size={13} className="extension-icon-check" />
        <span>Universal Platform Sync</span>
      </div>
    </div>
  );
};
