import React, { useState, useEffect } from 'react';
import {
  Eye,
  Clock,
  CheckCircle2,
  Share2,
  Copy,
  Check,
  Flag,
  ThumbsUp,
  ChevronDown,
  ChevronUp,
  Edit3,
  X,
  Sparkles,
  Film,
  Gamepad2,
  Music,
  Code,
  Tv,
} from 'lucide-react';
import { AnimeAvatarDisplay } from './AnimeAvatar.js';
import { Role } from '../types.js';

export interface StreamInfoBarProps {
  roomId: string;
  title?: string;
  hostUsername: string;
  hostAvatarId?: string;
  hostRole?: Role;
  userRole: Role;
  viewersCount: number;
  streamStartedAt?: number;
  category?: string;
  onSetCategory?: (category: string) => void;
  onOpenShare: () => void;
  onOpenReport: () => void;
  onNotify: (msg: string, type: 'success' | 'error' | 'info') => void;
  thumbnailUrl?: string;
  description?: string;
  onUpdateDescription?: (newDesc: string) => void;
  tags?: string[];
  onUpdateTags?: (newTags: string[]) => void;
  likes?: number;
  hasLiked?: boolean;
  onToggleLike?: () => void;
  isHostRegistered?: boolean;
  hostFollowersCount?: number;
}

const CATEGORIES = [
  { id: 'cinema', label: 'Cinema & Movies', icon: Film, color: '#f59e0b' },
  { id: 'gaming', label: 'Gaming', icon: Gamepad2, color: '#10b981' },
  { id: 'anime', label: 'Anime & Animation', icon: Sparkles, color: '#ec4899' },
  { id: 'music', label: 'Music & Vibes', icon: Music, color: '#8b5cf6' },
  { id: 'tech', label: 'Tech & Code', icon: Code, color: '#3b82f6' },
  { id: 'chatting', label: 'Just Chatting', icon: Tv, color: '#06b6d4' },
];

export const StreamInfoBar: React.FC<StreamInfoBarProps> = ({
  roomId,
  title,
  hostUsername,
  hostAvatarId,
  userRole,
  viewersCount,
  streamStartedAt,
  category = 'cinema',
  onSetCategory,
  onOpenShare,
  onOpenReport,
  onNotify,
  thumbnailUrl,
  description,
  onUpdateDescription,
  tags,
  onUpdateTags,
  likes = 0,
  hasLiked = false,
  onToggleLike,
  isHostRegistered = false,
  hostFollowersCount,
}) => {
  const [copiedLink, setCopiedLink] = useState(false);
  const defaultDesc = `Welcome to ${hostUsername}'s synchronized live watch party! Enjoy real-time video synchronization, theater viewing, interactive chat, and live reactions. Invite friends to join room #${roomId} to watch together without delay.`;
  const [localDescription, setLocalDescription] = useState<string>(description || '');
  const [localTags, setLocalTags] = useState<string[]>(
    tags && tags.length > 0 ? tags : ['#WatchParty', '#SyncTubeLive', '#CinemaHub']
  );
  const [isEditingDesc, setIsEditingDesc] = useState(false);
  const [descDraft, setDescDraft] = useState('');
  const [isEditingTags, setIsEditingTags] = useState(false);
  const [tagsDraft, setTagsDraft] = useState('');
  const [localLikes, setLocalLikes] = useState<number>(likes);
  const [localHasLiked, setLocalHasLiked] = useState<boolean>(hasLiked);
  const [isDescExpanded, setIsDescExpanded] = useState(false);
  const [showCategoryMenu, setShowCategoryMenu] = useState(false);
  const [currentCategory, setCurrentCategory] = useState(category);

  useEffect(() => {
    if (tags && tags.length > 0) {
      setLocalTags(tags);
    }
  }, [tags]);

  useEffect(() => {
    setLocalLikes(likes);
  }, [likes]);

  useEffect(() => {
    setLocalHasLiked(hasLiked);
  }, [hasLiked]);

  useEffect(() => {
    setCurrentCategory(category);
  }, [category]);

  useEffect(() => {
    if (typeof description === 'string') {
      setLocalDescription(description);
    }
  }, [description]);

  // Live stream uptime ticker
  const [uptimeSeconds, setUptimeSeconds] = useState(0);

  useEffect(() => {
    const start = streamStartedAt || Date.now();
    const updateTicker = () => {
      const diff = Math.max(0, Math.floor((Date.now() - start) / 1000));
      setUptimeSeconds(diff);
    };
    updateTicker();
    const interval = setInterval(updateTicker, 1000);
    return () => clearInterval(interval);
  }, [streamStartedAt]);

  const formatUptime = (totalSec: number) => {
    const hours = Math.floor(totalSec / 3600);
    const mins = Math.floor((totalSec % 3600) / 60);
    const secs = totalSec % 60;
    const pad = (n: number) => n.toString().padStart(2, '0');
    if (hours > 0) return `${pad(hours)}:${pad(mins)}:${pad(secs)}`;
    return `${pad(mins)}:${pad(secs)}`;
  };

  const handleCopyLink = () => {
    const url = `${window.location.origin}/room/${roomId}`;
    navigator.clipboard.writeText(url);
    setCopiedLink(true);
    onNotify('Stream link copied to clipboard!', 'success');
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const handleLike = () => {
    if (onToggleLike) {
      onToggleLike();
    } else {
      if (!localHasLiked) {
        setLocalLikes((prev) => prev + 1);
        setLocalHasLiked(true);
        onNotify('You liked this live stream!', 'success');
      } else {
        setLocalLikes((prev) => Math.max(0, prev - 1));
        setLocalHasLiked(false);
      }
    }
  };

  const canEditDesc = userRole === 'HOST' || userRole === 'MODERATOR';

  const handleStartEditing = () => {
    setDescDraft(localDescription || defaultDesc);
    setTagsDraft(localTags.join(' '));
    setIsDescExpanded(true);
    setIsEditingDesc(true);
  };

  const handleSaveTags = () => {
    const parsed = tagsDraft
      .split(/[\s,]+/)
      .map((t) => t.trim())
      .filter((t) => t.length > 0)
      .map((t) => (t.startsWith('#') ? t : `#${t}`))
      .slice(0, 12);
    const finalTags = parsed.length > 0 ? parsed : ['#WatchParty'];
    setLocalTags(finalTags);
    setIsEditingTags(false);
    onUpdateTags?.(finalTags);
    onNotify('Stream tags updated successfully!', 'success');
  };

  const handleSaveDescription = () => {
    const trimmed = descDraft.trim();
    setLocalDescription(trimmed);
    setIsEditingDesc(false);
    onUpdateDescription?.(trimmed);

    if (tagsDraft) {
      const parsed = tagsDraft
        .split(/[\s,]+/)
        .map((t) => t.trim())
        .filter((t) => t.length > 0)
        .map((t) => (t.startsWith('#') ? t : `#${t}`))
        .slice(0, 12);
      const finalTags = parsed.length > 0 ? parsed : ['#WatchParty'];
      setLocalTags(finalTags);
      onUpdateTags?.(finalTags);
    }

    onNotify('Stream details updated successfully!', 'success');
  };

  const handleCancelEditing = () => {
    setIsEditingDesc(false);
  };

  const selectedCatObj = CATEGORIES.find((c) => c.id === currentCategory) || CATEGORIES[0];
  const CategoryIcon = selectedCatObj.icon;

  const displayTitle = title?.trim() || `${hostUsername}'s Live Watch Stream`;

  return (
    <div className="stream-info-card glass-panel">
      {/* Top Bar: Title, Category Pill, Viewers Counter & Uptime */}
      <div className="stream-info-top">
        <div className="stream-title-group">
          <div className="stream-live-tag-row">
            <span className="live-status-pill magic-shimmer-badge">
              <span className="live-pulse-dot" />
              <span>LIVE</span>
            </span>

            {/* Category Badge with dropdown if host */}
            <div className="stream-category-wrapper">
              <button
                type="button"
                className="stream-category-pill"
                onClick={() => userRole === 'HOST' && setShowCategoryMenu((prev) => !prev)}
                title={userRole === 'HOST' ? 'Click to change stream category' : selectedCatObj.label}
                style={{ borderColor: `${selectedCatObj.color}40`, color: selectedCatObj.color }}
              >
                <CategoryIcon size={13} color={selectedCatObj.color} />
                <span>{selectedCatObj.label}</span>
                {userRole === 'HOST' && <ChevronDown size={12} />}
              </button>

              {showCategoryMenu && userRole === 'HOST' && (
                <div className="stream-category-dropdown card glass">
                  <div className="cat-dropdown-title">Select Stream Category</div>
                  {CATEGORIES.map((cat) => {
                    const Icon = cat.icon;
                    return (
                      <button
                        key={cat.id}
                        type="button"
                        className={`cat-dropdown-item ${currentCategory === cat.id ? 'active' : ''}`}
                        onClick={() => {
                          setCurrentCategory(cat.id);
                          onSetCategory?.(cat.id);
                          setShowCategoryMenu(false);
                          onNotify(`Stream category set to ${cat.label}`, 'success');
                        }}
                      >
                        <Icon size={14} color={cat.color} />
                        <span>{cat.label}</span>
                        {currentCategory === cat.id && <Check size={13} color="var(--accent)" />}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Live Viewers Count */}
            <div className="stream-metric-pill viewers-pill" title="Live Viewers Count">
              <Eye size={13} color="#10b981" />
              <strong className="metric-val">{viewersCount}</strong>
              <span className="metric-label">viewers</span>
            </div>

            {/* Stream Duration Clock */}
            <div className="stream-metric-pill uptime-pill" title="Stream live duration">
              <Clock size={13} color="#f59e0b" />
              <span className="metric-val">{formatUptime(uptimeSeconds)}</span>
            </div>
          </div>

          <h2 className="stream-main-title">{displayTitle}</h2>
        </div>
      </div>

      {/* Middle Bar: Host Channel, Avatar, Verified Badge, Subscribe, Actions */}
      <div className="stream-channel-row">
        {/* Left: Channel Info */}
        <div className="channel-profile-cluster">
          <div className="channel-avatar-ring">
            <AnimeAvatarDisplay username={hostUsername} avatarId={hostAvatarId || 'avatar-1'} size={42} />
            <span className="channel-online-badge" />
          </div>

          <div className="channel-meta-text">
            <div className="channel-name-line">
              <span className="channel-username">{hostUsername}</span>
              {isHostRegistered && (
                <span className="channel-verified-badge" title="Verified Creator & Host">
                  <CheckCircle2 size={15} color="#38bdf8" />
                </span>
              )}
            </div>
            <div className="channel-sub-info">
              <span>{isHostRegistered ? 'Host' : 'Guest Host'}</span>
              <span className="meta-dot">•</span>
              <span>Room #{roomId}</span>
              {isHostRegistered && (
                <>
                  <span className="meta-dot">•</span>
                  <span>{hostFollowersCount ? `${hostFollowersCount} followers` : 'Creator'}</span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Right: Stream Actions (Like, Share, Copy Link, Report) */}
        <div className="stream-actions-group">
          {/* Like Button */}
          <button
            type="button"
            className={`btn btn-secondary stream-action-btn like-btn ${localHasLiked ? 'has-liked' : ''}`}
            onClick={handleLike}
            title={localHasLiked ? 'Unlike' : 'Like Stream'}
          >
            <ThumbsUp size={15} color={localHasLiked ? 'var(--accent)' : 'inherit'} />
            <span className="stream-action-count">{localLikes}</span>
          </button>

          {/* Share Stream Button */}
          <button
            type="button"
            className="btn btn-secondary stream-action-btn"
            onClick={onOpenShare}
            title="Share stream with friends"
          >
            <Share2 size={15} />
            <span>Share</span>
          </button>

          {/* Copy Link Button */}
          <button
            type="button"
            className="btn btn-secondary stream-action-btn copy-link-btn"
            onClick={handleCopyLink}
            title="Copy stream link"
          >
            {copiedLink ? <Check size={14} color="#10b981" className="animate-check-bounce" /> : <Copy size={14} />}
            <span>{copiedLink ? 'Copied!' : 'Copy Link'}</span>
          </button>

          {/* Report Button */}
          <button
            type="button"
            className="btn btn-secondary stream-action-btn report-btn"
            onClick={onOpenReport}
            title="Report this stream"
            aria-label="Report Stream"
          >
            <Flag size={14} />
            <span>Report</span>
          </button>
        </div>
      </div>

      {/* Bottom: Collapsible Description Card with Host Edit Capability */}
      <div className="stream-desc-panel">
        <div className="stream-desc-header" onClick={() => setIsDescExpanded((prev) => !prev)}>
          <div className="stream-desc-preview">
            <span className="desc-views-date">
              {viewersCount} watching now • Live since{' '}
              {new Date(streamStartedAt || Date.now()).toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
              })}
            </span>
            {isEditingTags ? (
              <div className="stream-tags-inline-editor" onClick={(e) => e.stopPropagation()}>
                <input
                  type="text"
                  className="stream-tags-inline-input"
                  value={tagsDraft}
                  onChange={(e) => setTagsDraft(e.target.value)}
                  placeholder="Tags: #Anime #Movies #Live..."
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleSaveTags();
                    } else if (e.key === 'Escape') {
                      setIsEditingTags(false);
                    }
                  }}
                  autoFocus
                />
                <button
                  type="button"
                  className="btn btn-primary btn-xs"
                  onClick={handleSaveTags}
                  title="Save tags"
                >
                  <Check size={12} />
                </button>
                <button
                  type="button"
                  className="btn btn-secondary btn-xs"
                  onClick={() => setIsEditingTags(false)}
                  title="Cancel"
                >
                  <X size={12} />
                </button>
              </div>
            ) : (
              <div className="stream-tags-list">
                {localTags.map((tag, idx) => (
                  <span
                    key={idx}
                    className="stream-tag"
                    onClick={(e) => {
                      if (canEditDesc) {
                        e.stopPropagation();
                        setTagsDraft(localTags.join(' '));
                        setIsEditingTags(true);
                      }
                    }}
                    style={{ cursor: canEditDesc ? 'pointer' : 'default' }}
                    title={canEditDesc ? 'Click to edit stream tags' : undefined}
                  >
                    {tag}
                  </span>
                ))}
                {canEditDesc && (
                  <button
                    type="button"
                    className="stream-tag-edit-pill-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      setTagsDraft(localTags.join(' '));
                      setIsEditingTags(true);
                    }}
                    title="Edit stream tags (Host)"
                  >
                    <Edit3 size={10} />
                    <span>Edit Tags</span>
                  </button>
                )}
              </div>
            )}
          </div>
          <div className="stream-desc-header-right">
            {canEditDesc && !isEditingDesc && (
              <button
                type="button"
                className="btn btn-secondary btn-xs stream-desc-edit-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  handleStartEditing();
                }}
                title="Edit stream description (Host)"
              >
                <Edit3 size={12} />
                <span>Edit Description</span>
              </button>
            )}
            <button type="button" className="stream-desc-toggle-btn" aria-label="Toggle Description">
              {isDescExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </button>
          </div>
        </div>

        {isDescExpanded && (
          <div className="stream-desc-body">
            {isEditingDesc ? (
              <div className="stream-desc-edit-box">
                <div className="stream-desc-edit-header">
                  <div className="stream-desc-edit-title">
                    <Edit3 size={14} color="var(--accent)" />
                    <span>Edit Stream Description (Host / Mod)</span>
                  </div>
                  <button
                    type="button"
                    className="btn btn-ghost btn-xs"
                    onClick={handleCancelEditing}
                    title="Close editor"
                  >
                    <X size={14} />
                  </button>
                </div>
                <textarea
                  className="stream-desc-textarea"
                  value={descDraft}
                  onChange={(e) => setDescDraft(e.target.value)}
                  placeholder="Enter stream description, rules, schedule, or notes for party viewers..."
                  rows={4}
                  maxLength={1000}
                  autoFocus
                />
                <div className="stream-desc-tags-edit-block" style={{ marginTop: '0.65rem' }}>
                  <label style={{ fontSize: '0.74rem', fontWeight: 600, color: '#94a3b8', display: 'flex', alignItems: 'center', gap: '5px', marginBottom: '0.25rem' }}>
                    <Edit3 size={11} color="var(--accent)" /> Stream Tags (e.g. #Action #Cinema #Music):
                  </label>
                  <input
                    type="text"
                    className="stream-desc-tags-input"
                    value={tagsDraft}
                    onChange={(e) => setTagsDraft(e.target.value)}
                    placeholder="#WatchParty #CinemaHub #Anime..."
                    style={{
                      width: '100%',
                      padding: '0.45rem 0.75rem',
                      borderRadius: '8px',
                      background: 'rgba(0,0,0,0.35)',
                      border: '1px solid rgba(255,255,255,0.15)',
                      color: '#f8fafc',
                      fontSize: '0.82rem',
                    }}
                  />
                </div>
                <div className="stream-desc-edit-footer">
                  <span className="desc-char-count">{descDraft.length} / 1000 chars</span>
                  <div className="stream-desc-edit-actions">
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={handleCancelEditing}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      onClick={handleSaveDescription}
                    >
                      <Check size={14} />
                      <span>Save Description</span>
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <>
                {thumbnailUrl && (
                  <div className="stream-desc-thumb">
                    <img src={thumbnailUrl} alt={displayTitle} />
                  </div>
                )}
                <div className="stream-desc-text-wrapper">
                  <p className="stream-desc-text">
                    {localDescription || defaultDesc}
                  </p>
                  {canEditDesc && (
                    <button
                      type="button"
                      className="btn btn-secondary btn-xs stream-desc-inline-edit-btn"
                      onClick={handleStartEditing}
                      title="Edit stream description"
                    >
                      <Edit3 size={12} />
                      <span>Edit Description</span>
                    </button>
                  )}
                </div>
              </>
            )}

            <div className="stream-extra-meta">
              <div className="meta-field">
                <span className="meta-k">Broadcast Platform:</span>
                <span className="meta-v">SyncTube Universal Cinema</span>
              </div>
              <div className="meta-field">
                <span className="meta-k">Sync Protocol:</span>
                <span className="meta-v">WebSocket Drift Correction &lt;200ms</span>
              </div>
              <div className="meta-field">
                <span className="meta-k">DVR Capability:</span>
                <span className="meta-v">Full Scrubbing &amp; Live Catchup</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
