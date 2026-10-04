import React, { useState, useRef } from 'react';
import {
  ListMusic,
  Plus,
  Play,
  Trash2,
  ArrowUp,
  ArrowDown,
  GripVertical,
  SkipForward,
  ArrowLeft,
  ArrowRight,
  ExternalLink,
  Lock,
} from 'lucide-react';
import { PlaylistItem, Role } from '../types.js';
import { extractYouTubeId } from '../utils/youtube.js';

interface PlaylistProps {
  playlist: PlaylistItem[];
  currentVideoId: string;
  userRole: Role;
  onAddToPlaylist: (videoId: string) => void;
  onPlayItem: (videoId: string, itemId: string) => void;
  onNextVideo: () => void;
  onRemoveItem: (itemId: string) => void;
  onMoveToTop: (itemId: string) => void;
  onReorderPlaylist: (fromIndex: number, toIndex: number) => void;
  onOpenSearch?: () => void;
}

export const Playlist: React.FC<PlaylistProps> = ({
  playlist,
  currentVideoId,
  userRole,
  onAddToPlaylist,
  onPlayItem,
  onNextVideo,
  onRemoveItem,
  onMoveToTop,
  onReorderPlaylist,
  onOpenSearch,
}) => {
  const [newVideoUrl, setNewVideoUrl] = useState('');
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [swipedItemId, setSwipedItemId] = useState<string | null>(null);
  const [swipeDirection, setSwipeDirection] = useState<'left' | 'right' | null>(null);

  const touchStartXRef = useRef<number>(0);
  const touchStartYRef = useRef<number>(0);

  const canControl = userRole === 'HOST' || userRole === 'MODERATOR';

  const handleAddSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canControl) return;
    if (!newVideoUrl.trim()) return;

    const extracted = extractYouTubeId(newVideoUrl.trim());
    if (!extracted) {
      alert('Please enter a valid YouTube video URL or ID.');
      return;
    }

    onAddToPlaylist(extracted);
    setNewVideoUrl('');
  };

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

  // Touch Swipe Handlers for mobile & tablet (Host/Mod only)
  const handleTouchStart = (e: React.TouchEvent, itemId: string) => {
    if (!canControl) return;
    touchStartXRef.current = e.touches[0].clientX;
    touchStartYRef.current = e.touches[0].clientY;
  };

  const handleTouchEnd = (e: React.TouchEvent, itemId: string) => {
    if (!canControl) return;
    const deltaX = e.changedTouches[0].clientX - touchStartXRef.current;
    const deltaY = e.changedTouches[0].clientY - touchStartYRef.current;

    // Only recognize horizontal swipes
    if (Math.abs(deltaX) > 60 && Math.abs(deltaY) < 50) {
      if (deltaX > 60) {
        // Left-to-right swipe: Remove from playlist
        setSwipedItemId(itemId);
        setSwipeDirection('right');
        setTimeout(() => {
          onRemoveItem(itemId);
          setSwipedItemId(null);
          setSwipeDirection(null);
        }, 300);
      } else if (deltaX < -60) {
        // Right-to-left swipe: Move to top of playlist
        setSwipedItemId(itemId);
        setSwipeDirection('left');
        setTimeout(() => {
          onMoveToTop(itemId);
          setSwipedItemId(null);
          setSwipeDirection(null);
        }, 300);
      }
    }
  };

  return (
    <div className="glass-panel sidebar-card playlist-card">
      <div className="sidebar-title">
        <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <ListMusic size={18} />
          Playlist ({playlist.length})
        </span>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          {onOpenSearch && (
            <button
              type="button"
              className="btn btn-secondary next-video-btn"
              onClick={onOpenSearch}
              title="Search YouTube & Add to Queue"
            >
              <ExternalLink size={13} />
              <span>Search</span>
            </button>
          )}

          {playlist.length > 0 && canControl && (
            <button
              type="button"
              className="btn btn-secondary next-video-btn"
              onClick={onNextVideo}
              title="Play next video in queue"
            >
              <SkipForward size={14} />
              <span>Next</span>
            </button>
          )}
        </div>
      </div>

      {/* Add to Playlist Form or View-Only Badge */}
      {canControl ? (
        <form onSubmit={handleAddSubmit} className="playlist-add-form">
          <input
            type="text"
            className="input-field playlist-input"
            placeholder="Paste YouTube link or ID..."
            value={newVideoUrl}
            onChange={(e) => setNewVideoUrl(e.target.value)}
          />
          <button type="submit" className="btn btn-primary playlist-add-btn" title="Add to playlist">
            <Plus size={16} />
            <span>Add</span>
          </button>
        </form>
      ) : (
        <div className="playlist-view-only-badge">
          <Lock size={13} color="var(--accent-indigo)" />
          <span>Queue is managed by Host & Moderators</span>
        </div>
      )}



      {/* Playlist Items */}
      <div className="playlist-items-list">
        {playlist.length === 0 ? (
          <div className="playlist-empty-state">
            <ListMusic size={32} opacity={0.3} />
            <p>No videos in playlist yet</p>
            <span>Add YouTube links above to queue up videos!</span>
          </div>
        ) : (
          playlist.map((item, index) => {
            const isPlaying = item.videoId === currentVideoId;
            const isSwiping = swipedItemId === item.id;

            return (
              <div
                key={item.id}
                draggable={canControl}
                onDragStart={() => handleDragStart(index)}
                onDragOver={(e) => handleDragOver(e, index)}
                onDragEnd={handleDragEnd}
                onTouchStart={(e) => handleTouchStart(e, item.id)}
                onTouchEnd={(e) => handleTouchEnd(e, item.id)}
                className={`playlist-item ${isPlaying ? 'current-playing' : ''} ${
                  isSwiping ? (swipeDirection === 'right' ? 'swiping-right' : 'swiping-left') : ''
                }`}
              >
                {/* Drag Handle */}
                {canControl && (
                  <div className="drag-handle" title="Drag up or down to reorder">
                    <GripVertical size={16} />
                  </div>
                )}

                {/* Thumbnail / Badge */}
                <div className="playlist-item-thumb">
                  <img
                    src={`https://img.youtube.com/vi/${item.videoId}/mqdefault.jpg`}
                    alt="Thumbnail"
                    loading="lazy"
                    onError={(e) => {
                      (e.target as HTMLElement).style.display = 'none';
                    }}
                  />
                  {isPlaying && <span className="playing-badge">PLAYING</span>}
                </div>

                {/* Details */}
                <div className="playlist-item-info">
                  <span className="playlist-item-title">{item.title || `Video (${item.videoId})`}</span>
                  <span className="playlist-item-id">ID: {item.videoId}</span>
                </div>

                {/* Action Buttons: Host/Mod Only */}
                {canControl && (
                  <div className="playlist-item-actions">
                    {!isPlaying && (
                      <button
                        type="button"
                        className="btn-icon play-btn"
                        onClick={() => onPlayItem(item.videoId, item.id)}
                        title="Play this video now"
                        aria-label="Play video"
                      >
                        <Play size={15} color="var(--accent-emerald)" fill="var(--accent-emerald)" />
                      </button>
                    )}

                    <button
                      type="button"
                      className="btn-icon move-top-btn"
                      onClick={() => onMoveToTop(item.id)}
                      title="Move to top of playlist (Swipe Left)"
                      aria-label="Move to top"
                    >
                      <ArrowUp size={15} color="var(--accent-cyan)" />
                    </button>

                    <button
                      type="button"
                      className="btn-icon remove-btn"
                      onClick={() => onRemoveItem(item.id)}
                      title="Remove from playlist (Swipe Right)"
                      aria-label="Remove item"
                    >
                      <Trash2 size={15} color="var(--accent-rose)" />
                    </button>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
