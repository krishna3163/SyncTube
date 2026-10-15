import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  ListMusic,
  Plus,
  Play,
  Trash2,
  ArrowUp,
  GripVertical,
  Shuffle,
  ThumbsUp,
  Search,
  MoreVertical,
  Copy,
  ExternalLink,
  Sparkles,
} from 'lucide-react';
import { PlaylistItem, Role } from '../types.js';
import { AnimeAvatarDisplay } from './AnimeAvatar.js';
import { getParticipantCharacterId } from '../utils/characterMemory.js';

interface PlaylistProps {
  playlist: PlaylistItem[];
  currentVideoId: string;
  userRole: Role;
  currentUserId: string;
  onAddToPlaylist: (
    videoId: string,
    title?: string,
    duration?: string,
    channel?: string,
    thumbnail?: string
  ) => void;
  onImportPlaylist?: (url: string) => Promise<void> | void;
  onPlayItem: (videoId: string, itemId: string) => void;
  onNextVideo?: () => void;
  onRemoveItem: (itemId: string) => void;
  onMoveToTop: (itemId: string) => void;
  onReorderPlaylist: (fromIndex: number, toIndex: number) => void;
  onVoteItem: (itemId: string) => void;
  onShuffle?: () => void;
  onClear?: () => void;
  onOpenSearch?: () => void;
}

export const Playlist: React.FC<PlaylistProps> = ({
  playlist,
  currentVideoId,
  userRole,
  currentUserId,
  onImportPlaylist,
  onPlayItem,
  onNextVideo,
  onRemoveItem,
  onMoveToTop,
  onReorderPlaylist,
  onVoteItem,
  onShuffle,
  onClear,
  onOpenSearch,
}) => {
  const [importInput, setImportInput] = useState('');
  const [isImporting, setIsImporting] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [menuAnchor, setMenuAnchor] = useState<{
    id: string;
    top: number;
    bottom: number;
    right: number;
    openUpwards: boolean;
  } | null>(null);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [sortByVotes, setSortByVotes] = useState(false);
  const [sortAlphabetically, setSortAlphabetically] = useState(false);

  const canControl = userRole === 'HOST' || userRole === 'MODERATOR';

  // Drag and Drop handlers
  const handleDragStart = (index: number) => {
    if (!canControl) return;
    setDraggedIndex(index);
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (!canControl) return;
    if (draggedIndex === null || draggedIndex === index) return;
    onReorderPlaylist(draggedIndex, index);
    setDraggedIndex(index);
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
  };

  // Close dropdown on outside click, window resize, or scroll
  useEffect(() => {
    if (!menuAnchor) return;
    const handlePointerDown = (e: MouseEvent | TouchEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target?.closest('.upnext-dropdown-menu') ||
        target?.closest('.upnext-menu-trigger')
      ) {
        return;
      }
      setMenuAnchor(null);
    };

    const handleScrollOrResize = () => {
      setMenuAnchor(null);
    };

    window.addEventListener('mousedown', handlePointerDown);
    window.addEventListener('touchstart', handlePointerDown);
    window.addEventListener('scroll', handleScrollOrResize, true);
    window.addEventListener('resize', handleScrollOrResize);

    return () => {
      window.removeEventListener('mousedown', handlePointerDown);
      window.removeEventListener('touchstart', handlePointerDown);
      window.removeEventListener('scroll', handleScrollOrResize, true);
      window.removeEventListener('resize', handleScrollOrResize);
    };
  }, [menuAnchor]);

  const handleToggleMenu = (e: React.MouseEvent<HTMLButtonElement>, itemId: string) => {
    e.stopPropagation();
    if (menuAnchor?.id === itemId) {
      setMenuAnchor(null);
      return;
    }
    const rect = e.currentTarget.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const openUpwards = spaceBelow < 210;
    setMenuAnchor({
      id: itemId,
      top: rect.top,
      bottom: rect.bottom,
      right: Math.max(8, window.innerWidth - rect.right),
      openUpwards,
    });
  };

  // Filter playlist items by local search query
  const filteredPlaylist = playlist.filter((item) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    const titleMatch = item.title?.toLowerCase().includes(q);
    const channelMatch = item.channel?.toLowerCase().includes(q);
    const idMatch = item.videoId.toLowerCase().includes(q);
    const addedByMatch = item.addedBy?.toLowerCase().includes(q);
    return titleMatch || channelMatch || idMatch || addedByMatch;
  });

  const displayPlaylist = sortAlphabetically
    ? [...filteredPlaylist].sort((a, b) => (a.title || a.videoId).localeCompare(b.title || b.videoId))
    : sortByVotes
      ? [...filteredPlaylist].sort((a, b) => (b.votes?.length || 0) - (a.votes?.length || 0))
      : filteredPlaylist;

  const handleCopyLink = (videoId: string) => {
    navigator.clipboard?.writeText(`https://www.youtube.com/watch?v=${videoId}`);
    setMenuAnchor(null);
  };

  return (
    <div className="glass-panel sidebar-card upnext-panel playlist-container playlist-panel-v2">
      {/* Top Header Bar with clean two-row hierarchy */}
      <div className="upnext-header">
        <div className="upnext-header-row-top">
          <div className="upnext-title-wrap">
            <ListMusic size={18} className="upnext-icon" />
            <span className="upnext-title">Up Next ({playlist.length})</span>
          </div>

          {onOpenSearch && (
            <button
              type="button"
              className="btn btn-primary btn-sm upnext-add-btn"
              onClick={onOpenSearch}
              title="Search and add video to playlist"
            >
              <Plus size={13} />
              <span>Add Video</span>
            </button>
          )}
        </div>

        <div className="upnext-header-row-bottom">
          <div className="upnext-search-wrap">
            <Search size={13} className="upnext-search-icon" />
            <input
              type="text"
              className="upnext-search-input"
              placeholder="Filter queue..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          <div className="upnext-tools-row">
            {canControl && onShuffle && (
              <button
                type="button"
                className="upnext-chip-btn"
                onClick={onShuffle}
                title="Shuffle playlist"
              >
                <Shuffle size={12} />
                <span>Shuffle</span>
              </button>
            )}

            <button
              type="button"
              className={`upnext-chip-btn ${sortByVotes ? 'active' : ''}`}
              onClick={() => {
                setSortByVotes((value) => !value);
                setSortAlphabetically(false);
              }}
              title={sortByVotes ? 'Sorted by Most Votes (click for normal order)' : 'Sort by Most Voted'}
            >
              <ThumbsUp size={12} />
              <span>Votes</span>
            </button>

            <button
              type="button"
              className={`upnext-chip-btn ${sortAlphabetically ? 'active' : ''}`}
              onClick={() => {
                setSortAlphabetically((value) => !value);
                setSortByVotes(false);
              }}
              title={sortAlphabetically ? 'Sorted A-Z (click for queue order)' : 'Sort A-Z'}
            >
              <span>A-Z</span>
            </button>

            {canControl && onClear && playlist.length > 0 && (
              <button
                type="button"
                className="upnext-chip-btn upnext-chip-danger"
                onClick={() => {
                  if (window.confirm('Clear all videos from playlist?')) {
                    onClear();
                  }
                }}
                title="Clear playlist"
              >
                <Trash2 size={12} />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* YouTube Playlist Quick Import Bar */}
      {canControl && onImportPlaylist && (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (!importInput.trim()) return;
            setIsImporting(true);
            try {
              await onImportPlaylist(importInput.trim());
              setImportInput('');
            } finally {
              setIsImporting(false);
            }
          }}
          className="playlist-import-bar"
          style={{
            display: 'flex',
            gap: '6px',
            padding: '8px 12px',
            background: 'rgba(255, 255, 255, 0.03)',
            borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
          }}
        >
          <input
            type="text"
            className="upnext-search-input"
            style={{ flex: 1, fontSize: '0.78rem' }}
            placeholder="Paste YouTube Playlist link (list=PL...)"
            value={importInput}
            onChange={(e) => setImportInput(e.target.value)}
          />
          <button
            type="submit"
            disabled={!importInput.trim() || isImporting}
            className="btn btn-primary btn-sm"
            style={{ padding: '0 10px', fontSize: '0.75rem', whiteSpace: 'nowrap' }}
            title="Import all songs/videos from YouTube playlist"
          >
            <Sparkles size={12} />
            <span>{isImporting ? 'Importing...' : 'Import Playlist'}</span>
          </button>
        </form>
      )}

      {/* Playlist Items List */}
      <div className="upnext-items-list">
        {displayPlaylist.length === 0 ? (
          <div className="upnext-empty-state">
            <ListMusic size={36} opacity={0.3} />
            <p>{searchQuery ? 'No matching videos in playlist' : 'No videos in Up Next queue'}</p>
            {onOpenSearch && (
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={onOpenSearch}
                style={{ marginTop: '0.6rem' }}
              >
                <Plus size={14} /> Add First Video
              </button>
            )}
          </div>
        ) : (
          displayPlaylist.map((item, index) => {
            const isPlaying = item.videoId === currentVideoId;
            const voteCount = item.votes?.length || 0;
            const hasVoted = Boolean(item.votes?.includes(currentUserId));
            const isMenuOpen = menuAnchor?.id === item.id;

            return (
              <div
                key={item.id}
                draggable={canControl && !sortByVotes && !searchQuery.trim()}
                onDragStart={() => handleDragStart(index)}
                onDragOver={(e) => handleDragOver(e, index)}
                onDragEnd={handleDragEnd}
                className={`upnext-item-row ${isPlaying ? 'is-playing-row' : ''} ${isMenuOpen ? 'has-active-menu' : ''}`}
              >
                {/* Index Number */}
                <div className="upnext-index-col">
                  {canControl && !sortByVotes && !searchQuery.trim() && (
                    <span title="Drag to reorder" className="upnext-grip">
                      <GripVertical size={13} />
                    </span>
                  )}
                  <span className="upnext-index-num">{index + 1}</span>
                </div>

                {/* Thumbnail with PLAYING overlay */}
                <div className="upnext-thumb-col">
                  <div className="upnext-thumb-wrapper">
                    <img
                      src={
                        item.thumbnail ||
                        `https://img.youtube.com/vi/${item.videoId}/mqdefault.jpg`
                      }
                      alt={item.title || 'Video Thumbnail'}
                      className="upnext-thumb-img"
                      loading="lazy"
                      onError={(e) => {
                        (e.target as HTMLImageElement).src = `https://img.youtube.com/vi/${item.videoId}/hqdefault.jpg`;
                      }}
                    />
                    {isPlaying && (
                      <div className="upnext-playing-overlay">
                        <Play size={10} fill="currentColor" />
                        <span>PLAYING</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Title & Subtitle */}
                <div className="upnext-info-col">
                  <h4 className="upnext-video-title" title={item.title}>
                    {item.title || `YouTube Video (${item.videoId})`}
                  </h4>
                  <div className="upnext-subtitle">
                    {item.channel && <span className="upnext-channel">{item.channel}</span>}
                    {item.duration && (
                      <>
                        <span className="upnext-dot">•</span>
                        <span className="upnext-duration">{item.duration}</span>
                      </>
                    )}
                    {item.addedBy && (
                      <>
                        <span className="upnext-dot">•</span>
                        <span className="upnext-added-by">Added by {item.addedBy}</span>
                      </>
                    )}
                  </div>
                </div>

                {/* Right Actions: Avatar, Thumbs Up Vote, Play, Three-dot Menu */}
                <div className="upnext-actions-col">
                  {/* Avatar of submitter if available */}
                  {item.addedBy && (
                    <div className="upnext-avatar-wrap" title={`Added by ${item.addedBy}`}>
                      <AnimeAvatarDisplay
                        username={item.addedBy}
                        avatarId={getParticipantCharacterId(item.addedBy, undefined, item.addedByAvatarId)}
                        size={22}
                      />
                    </div>
                  )}

                  {/* Thumbs Up Vote Button (available to all users) */}
                  <button
                    type="button"
                    className={`upnext-vote-btn ${hasVoted ? 'has-voted' : ''}`}
                    onClick={() => onVoteItem(item.id)}
                    title={hasVoted ? 'You upvoted this video (click to remove)' : 'Upvote this video'}
                  >
                    <ThumbsUp size={13} fill={hasVoted ? 'currentColor' : 'none'} />
                    <span className="upnext-vote-count">{voteCount}</span>
                  </button>

                  {/* Quick Play Button (Host/Mod only) */}
                  {canControl && (
                    <button
                      type="button"
                      className="upnext-play-btn"
                      onClick={() => onPlayItem(item.videoId, item.id)}
                      title="Play this video now"
                    >
                      <Play size={14} fill="currentColor" />
                    </button>
                  )}

                  {/* More options menu button */}
                  <div className="upnext-menu-container">
                    <button
                      type="button"
                      className={`upnext-menu-trigger ${isMenuOpen ? 'active' : ''}`}
                      onClick={(e) => handleToggleMenu(e, item.id)}
                      title="More options"
                    >
                      <MoreVertical size={15} />
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Portal Dropdown Menu attached directly to document.body — prevents overflow clipping & disappearing */}
      {menuAnchor && (() => {
        const activeItem = playlist.find((i) => i.id === menuAnchor.id);
        if (!activeItem) return null;
        return createPortal(
          <div
            className="upnext-dropdown-menu portal-dropdown-menu"
            style={{
              position: 'fixed',
              zIndex: 999999,
              right: `${menuAnchor.right}px`,
              ...(menuAnchor.openUpwards
                ? { bottom: `${Math.max(8, window.innerHeight - menuAnchor.top + 6)}px` }
                : { top: `${Math.max(8, menuAnchor.bottom + 6)}px` }),
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {canControl && (
              <button
                type="button"
                className="upnext-menu-item"
                onClick={() => {
                  onMoveToTop(activeItem.id);
                  setMenuAnchor(null);
                }}
              >
                <ArrowUp size={14} color="var(--accent-cyan)" />
                <span>Move to Top</span>
              </button>
            )}
            <button
              type="button"
              className="upnext-menu-item"
              onClick={() => {
                handleCopyLink(activeItem.videoId);
                setMenuAnchor(null);
              }}
            >
              <Copy size={14} />
              <span>Copy Video Link</span>
            </button>
            <a
              href={`https://www.youtube.com/watch?v=${activeItem.videoId}`}
              target="_blank"
              rel="noreferrer"
              className="upnext-menu-item"
              onClick={() => setMenuAnchor(null)}
            >
              <ExternalLink size={14} />
              <span>Open on YouTube</span>
            </a>
            {canControl && (
              <button
                type="button"
                className="upnext-menu-item text-danger"
                onClick={() => {
                  onRemoveItem(activeItem.id);
                  setMenuAnchor(null);
                }}
              >
                <Trash2 size={14} color="var(--accent-rose)" />
                <span>Remove from Queue</span>
              </button>
            )}
          </div>,
          document.body
        );
      })()}
    </div>
  );
};
