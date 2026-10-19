import React, { useState } from 'react';
import {
  WhatsAppIcon,
  TelegramIcon,
  DiscordIcon,
  XTwitterIcon,
  RedditIcon,
} from './SocialBrandIcons.js';
import { Share2, Copy, Check } from 'lucide-react';
import { playLinkCopySound } from '../utils/soundEffects.js';

interface SocialShareBarProps {
  roomId: string;
  streamTitle?: string;
  onNotify?: (msg: string, type: 'success' | 'error' | 'info') => void;
  compact?: boolean;
}

export const SocialShareBar: React.FC<SocialShareBarProps> = ({
  roomId,
  streamTitle = 'Live Watch Party',
  onNotify,
  compact = false,
}) => {
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedDiscord, setCopiedDiscord] = useState(false);

  const inviteUrl = typeof window !== 'undefined'
    ? `${window.location.origin}/?room=${encodeURIComponent(roomId)}`
    : `https://synctube.app/?room=${roomId}`;

  const shareText = `🍿 Join my SyncTube Watch Party: "${streamTitle}" (Room: ${roomId})`;
  const encodedText = encodeURIComponent(shareText);
  const encodedUrl = encodeURIComponent(inviteUrl);

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(inviteUrl);
      playLinkCopySound();
      setCopiedLink(true);
      onNotify?.('Watch party link copied to clipboard!', 'success');
      setTimeout(() => setCopiedLink(false), 2200);
    } catch {
      onNotify?.('Failed to copy link', 'error');
    }
  };

  const handleCopyForDiscord = async () => {
    try {
      const discordMsg = `**🎬 Join my Watch Party on SyncTube!**\n> Stream: *${streamTitle}*\n> Room Code: \`${roomId}\`\n👉 **Join here:** ${inviteUrl}`;
      await navigator.clipboard.writeText(discordMsg);
      playLinkCopySound();
      setCopiedDiscord(true);
      onNotify?.('Discord formatted invite copied! Paste it into any server.', 'success');
      setTimeout(() => setCopiedDiscord(false), 2200);
    } catch {
      onNotify?.('Failed to copy Discord message', 'error');
    }
  };

  const handleNativeShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: `Join my SyncTube Watch Party (${roomId})`,
          text: shareText,
          url: inviteUrl,
        });
        playLinkCopySound();
        onNotify?.('Shared successfully!', 'success');
      } catch (err) {
        // User cancelled or unsupported
      }
    } else {
      handleCopyLink();
    }
  };

  const shareToWhatsApp = () => {
    const text = `${shareText}\n${inviteUrl}`;
    window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`, '_blank', 'noopener,noreferrer');
  };

  const shareToTelegram = () => {
    window.open(`https://t.me/share/url?url=${encodedUrl}&text=${encodedText}`, '_blank', 'noopener,noreferrer');
  };

  const shareToX = () => {
    window.open(`https://x.com/intent/tweet?text=${encodedText}&url=${encodedUrl}&hashtags=SyncTube,WatchParty`, '_blank', 'noopener,noreferrer');
  };

  const shareToReddit = () => {
    window.open(`https://www.reddit.com/submit?url=${encodedUrl}&title=${encodedText}`, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className={`social-share-bar ${compact ? 'compact' : ''}`}>
      <div className="social-share-buttons">
        <button
          type="button"
          className="social-btn whatsapp"
          onClick={shareToWhatsApp}
          title="Share to WhatsApp"
          aria-label="Share watch party to WhatsApp"
        >
          <WhatsAppIcon size={18} />
          {!compact && <span>WhatsApp</span>}
        </button>

        <button
          type="button"
          className="social-btn telegram"
          onClick={shareToTelegram}
          title="Share to Telegram"
          aria-label="Share watch party to Telegram"
        >
          <TelegramIcon size={18} />
          {!compact && <span>Telegram</span>}
        </button>

        <button
          type="button"
          className="social-btn discord"
          onClick={handleCopyForDiscord}
          title="Copy formatted Discord invite"
          aria-label="Copy formatted Discord invite to clipboard"
        >
          {copiedDiscord ? <Check size={18} color="#34d399" /> : <DiscordIcon size={18} />}
          {!compact && <span>{copiedDiscord ? 'Copied!' : 'Discord'}</span>}
        </button>

        <button
          type="button"
          className="social-btn x-twitter"
          onClick={shareToX}
          title="Post to X (Twitter)"
          aria-label="Post watch party to X"
        >
          <XTwitterIcon size={16} />
          {!compact && <span>X</span>}
        </button>

        <button
          type="button"
          className="social-btn reddit"
          onClick={shareToReddit}
          title="Share to Reddit"
          aria-label="Share watch party to Reddit"
        >
          <RedditIcon size={18} />
          {!compact && <span>Reddit</span>}
        </button>

        {typeof navigator !== 'undefined' && 'share' in navigator && (
          <button
            type="button"
            className="social-btn native-share"
            onClick={handleNativeShare}
            title="More share options"
            aria-label="Open native device share options"
          >
            <Share2 size={16} />
            {!compact && <span>More</span>}
          </button>
        )}

        <button
          type="button"
          className="social-btn copy-btn"
          onClick={handleCopyLink}
          title="Copy direct watch party link"
          aria-label="Copy direct watch party link"
        >
          {copiedLink ? <Check size={16} color="#34d399" /> : <Copy size={16} />}
          {!compact && <span>{copiedLink ? 'Copied' : 'Copy'}</span>}
        </button>
      </div>
    </div>
  );
};
