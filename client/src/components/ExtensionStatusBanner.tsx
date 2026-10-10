import React from 'react';
import type { MediaIdentity } from '../types.js';

interface ExtensionStatusBannerProps {
  extensionInstalled: boolean;
  partyMedia: MediaIdentity | null;
  activeTabMedia: MediaIdentity | null;
  onOpenPartyMedia?: () => void;
  onSyncTab?: () => void;
}

export const ExtensionStatusBanner: React.FC<ExtensionStatusBannerProps> = () => {
  // Completely removed "SyncTube V2 Extension: Extension ready for tab sync" banner per user request
  return null;
};
