import React, { useState, useEffect, useRef } from 'react';
import { Search, Play, Plus, X, Loader2, Sparkles } from 'lucide-react';
import { Role } from '../types.js';

interface SearchResultItem {
  videoId: string;
  title: string;
  duration: string;
  thumbnail: string;
}

interface YouTubeSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  userRole: Role;
  onPlayVideo: (videoId: string) => void;
  onAddToPlaylist: (videoId: string, title?: string) => void;
  onRequestAction?: (type: 'change_video', videoId: string) => void;
  onNotify: (msg: string, type: 'info' | 'success' | 'error') => void;
}

const PRESET_TAGS = [
  'Lo-Fi Study Beats',
  'Anime Openings',
  'Attack on Titan OST',
  'Movie Trailers',
  'Gaming Highlights',
  'Cyberpunk Edgerunners',
];

export const YouTubeSearchModal: React.FC<YouTubeSearchModalProps> = ({
  isOpen,
  onClose,
  userRole,
  onPlayVideo,
  onAddToPlaylist,
  onRequestAction,
  onNotify,
}) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResultItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 100);
      if (results.length === 0 && !query) {
        performSearch('popular anime openings');
      }
    }
  }, [isOpen]);

  const performSearch = async (searchTerm: string) => {
    const q = searchTerm.trim();
    if (!q) return;

    setIsLoading(true);
    try {
      const resp = await fetch(`/api/youtube/search?q=${encodeURIComponent(q)}`);
      if (!resp.ok) throw new Error('Search failed');
      const data = await resp.json();
      setResults(data.results || []);
    } catch {
      onNotify('Could not load YouTube search results. Try another query.', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    performSearch(query);
  };

  const handlePlay = (item: SearchResultItem) => {
    if (userRole === 'HOST' || userRole === 'MODERATOR') {
      onPlayVideo(item.videoId);
      onNotify(`Playing "${item.title.substring(0, 30)}..."`, 'success');
      onClose();
    } else if (onRequestAction) {
      onRequestAction('change_video', item.videoId);
      onNotify('Play request sent to Host for approval!', 'info');
      onClose();
    } else {
      onNotify('Only Hosts and Moderators can switch videos directly.', 'error');
    }
  };

  const handleQueue = (item: SearchResultItem) => {
    onAddToPlaylist(item.videoId, item.title);
    onNotify(`Added "${item.title.substring(0, 25)}..." to queue`, 'success');
  };

  if (!isOpen) return null;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="glass-panel modal-card yt-search-modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <Search size={20} color="var(--accent)" />
            <h2 className="modal-title">Search YouTube Videos</h2>
          </div>
          <button type="button" className="btn-icon" onClick={onClose} title="Close">
            <X size={18} />
          </button>
        </div>

        <div className="modal-body yt-search-modal-body">
          {/* Search Bar */}
          <form onSubmit={handleSearchSubmit} className="yt-search-form">
            <div className="yt-search-input-wrap">
              <Search size={18} className="yt-search-icon" />
              <input
                ref={inputRef}
                type="text"
                className="input-field yt-search-input"
                placeholder="Search songs, anime, trailers, lofi..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              {isLoading && <Loader2 size={18} className="spin-icon yt-search-loader" />}
            </div>
            <button type="submit" className="btn btn-primary yt-search-submit-btn" disabled={isLoading || !query.trim()}>
              Search
            </button>
          </form>

          {/* Preset Quick Tags */}
          <div className="yt-search-presets">
            {PRESET_TAGS.map((tag) => (
              <button
                key={tag}
                type="button"
                className="yt-preset-pill"
                onClick={() => {
                  setQuery(tag);
                  performSearch(tag);
                }}
              >
                <Sparkles size={12} />
                <span>{tag}</span>
              </button>
            ))}
          </div>

          {/* Search Results List */}
          <div className="yt-search-results">
            {isLoading && (
              <div className="yt-search-loading">
                <Loader2 size={28} className="spin-icon" color="var(--accent)" />
                <p>Searching YouTube...</p>
              </div>
            )}

            {!isLoading && results.length === 0 && (
              <div className="yt-search-empty">
                <p>No videos found. Try searching for a specific song or video title.</p>
              </div>
            )}

            {!isLoading &&
              results.map((item) => (
                <div key={item.videoId} className="yt-search-item">
                  <div className="yt-search-item-thumb-wrap">
                    <img
                      src={item.thumbnail}
                      alt={item.title}
                      className="yt-search-item-thumb"
                      loading="lazy"
                    />
                    {item.duration && (
                      <span className="yt-search-duration-badge">{item.duration}</span>
                    )}
                  </div>
                  <div className="yt-search-item-info">
                    <h4 className="yt-search-item-title" title={item.title}>
                      {item.title}
                    </h4>
                    <span className="yt-search-item-id">ID: {item.videoId}</span>
                  </div>
                  <div className="yt-search-item-actions">
                    <button
                      type="button"
                      className="btn btn-secondary yt-btn-action"
                      onClick={() => handleQueue(item)}
                      title="Add to Watch Party Playlist"
                    >
                      <Plus size={15} />
                      <span>Queue</span>
                    </button>
                    <button
                      type="button"
                      className="btn btn-primary yt-btn-action"
                      onClick={() => handlePlay(item)}
                      title={userRole === 'PARTICIPANT' ? 'Request to Play' : 'Play Now'}
                    >
                      <Play size={15} />
                      <span>{userRole === 'PARTICIPANT' ? 'Request' : 'Play'}</span>
                    </button>
                  </div>
                </div>
              ))}
          </div>
        </div>
      </div>
    </div>
  );
};
