import React, { useState, useEffect, useRef } from 'react';
import { Search, Play, Plus, X, Loader2, Sparkles, SkipForward, ListMusic } from 'lucide-react';
import { Role } from '../types.js';
import { getApiUrl } from '../utils/api.js';
import { getSafeYouTubeThumbnailUrl } from '../utils/identity.js';
import { extractYouTubeId, extractYouTubePlaylistId } from '../utils/youtube.js';

interface SearchResultItem {
  videoId: string;
  title: string;
  duration?: string;
  channel?: string;
  thumbnail: string;
}

interface YouTubeSearchModalProps {
  isOpen: boolean;
  inline?: boolean;
  onClose: () => void;
  userRole: Role;
  onPlayVideo: (videoId: string) => void;
  onAddToPlaylist: (
    videoId: string,
    title?: string,
    duration?: string,
    channel?: string,
    thumbnail?: string
  ) => void;
  onAddPlaylistBatch?: (
    items: {
      videoId: string;
      title?: string;
      duration?: string;
      channel?: string;
      thumbnail?: string;
    }[]
  ) => void;
  onRequestAction?: (
    type: 'change_video' | 'request_next_video',
    data: { videoId: string; title?: string; duration?: string; channel?: string }
  ) => void;
  onNotify: (msg: string, type: 'info' | 'success' | 'error') => void;
}

const PRESET_TAGS = [
  'Lo-Fi Study Beats',
  'Anime Openings',
  'Attack on Titan OST',
  'Movie Trailers',
  'Gaming Highlights',
  'Cyberpunk Edgerunners',
  'Agam Krishna',
  'Hans Zimmer',
  'Diljit Dosanjh',
];

export const YouTubeSearchModal: React.FC<YouTubeSearchModalProps> = ({
  isOpen,
  inline = false,
  onClose,
  userRole,
  onPlayVideo,
  onAddToPlaylist,
  onAddPlaylistBatch,
  onRequestAction,
  onNotify,
}) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResultItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [playlistInfo, setPlaylistInfo] = useState<{
    title: string;
    count: number;
    items: SearchResultItem[];
  } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 100);
      if (results.length === 0 && !query) {
        performSearch('popular anime openings');
      }
    }
  }, [isOpen]);

  const CLIENT_FALLBACK_CATALOGUE: SearchResultItem[] = [
    {
      videoId: 'jJPMnTXl63E',
      title: 'Agam - Krishna Ki Chetavani (Rashmirathi) | Shreeman Narayan Narayan Hari Hari',
      channel: 'Agam Aggarwal',
      duration: '44:47',
      thumbnail: 'https://img.youtube.com/vi/jJPMnTXl63E/hqdefault.jpg',
    },
    {
      videoId: 'RxabLA7UQ9k',
      title: 'Hans Zimmer - Time (Official Audio)',
      channel: 'Hans Zimmer',
      duration: '4:35',
      thumbnail: 'https://img.youtube.com/vi/RxabLA7UQ9k/hqdefault.jpg',
    },
    {
      videoId: 'z2X2nXBahrk',
      title: 'Rebel Foods Story - Building the World’s Largest Cloud Kitchen',
      channel: 'Rebel Foods',
      duration: '12:45',
      thumbnail: 'https://img.youtube.com/vi/z2X2nXBahrk/hqdefault.jpg',
    },
    {
      videoId: 'cl0a3i2wFcc',
      title: 'Diljit Dosanjh - Lover (Official Music Video)',
      channel: 'Diljit Dosanjh',
      duration: '3:31',
      thumbnail: 'https://img.youtube.com/vi/cl0a3i2wFcc/hqdefault.jpg',
    },
    {
      videoId: 'jfKfPfyJRdk',
      title: 'Lofi Hip Hop Radio - Beats to Relax/Study to',
      channel: 'Lofi Girl',
      duration: 'LIVE',
      thumbnail: 'https://img.youtube.com/vi/jfKfPfyJRdk/hqdefault.jpg',
    },
    {
      videoId: '2S4qGKmzBJE',
      title: 'The Rumbling (TV Size) - Attack on Titan Final Season Part 2 OP',
      channel: 'SiM Official',
      duration: '1:30',
      thumbnail: 'https://img.youtube.com/vi/2S4qGKmzBJE/hqdefault.jpg',
    },
    {
      videoId: 'mpCOh_J_uOU',
      title: 'LiSA - Gurenge (Demon Slayer Kimetsu no Yaiba OP)',
      channel: 'LiSA Official',
      duration: '3:56',
      thumbnail: 'https://img.youtube.com/vi/mpCOh_J_uOU/hqdefault.jpg',
    },
    {
      videoId: 'KvMY1uzSC1E',
      title: 'Cyberpunk Edgerunners - I Really Want to Stay at Your House',
      channel: 'Rosa Walton',
      duration: '4:06',
      thumbnail: 'https://img.youtube.com/vi/KvMY1uzSC1E/hqdefault.jpg',
    },
    {
      videoId: 'Way9Dexny3w',
      title: 'Dune: Part Two | Official Trailer 3',
      channel: 'Warner Bros. Pictures',
      duration: '2:53',
      thumbnail: 'https://img.youtube.com/vi/Way9Dexny3w/hqdefault.jpg',
    },
    {
      videoId: 'UDVtMYqUAyw',
      title: 'Hans Zimmer - Interstellar Main Theme (Extra Extended)',
      channel: 'Hans Zimmer',
      duration: '6:47',
      thumbnail: 'https://img.youtube.com/vi/UDVtMYqUAyw/hqdefault.jpg',
    },
    {
      videoId: 'dQw4w9WgXcQ',
      title: 'Rick Astley - Never Gonna Give You Up',
      channel: 'Rick Astley',
      duration: '3:33',
      thumbnail: 'https://img.youtube.com/vi/dQw4w9WgXcQ/hqdefault.jpg',
    },
  ];

  const performSearch = async (searchTerm: string) => {
    const q = searchTerm.trim();
    if (!q) return;

    // 1. Check if user entered a playlist link or ID
    const playlistId = extractYouTubePlaylistId(q);
    if (playlistId) {
      setIsLoading(true);
      setPlaylistInfo(null);
      const playlistEndpoints: string[] = [];
      const primaryApiUrl = getApiUrl();
      if (primaryApiUrl) {
        playlistEndpoints.push(`${primaryApiUrl}/api/youtube/playlist?url=${encodeURIComponent(q)}`);
      } else {
        playlistEndpoints.push(`/api/youtube/playlist?url=${encodeURIComponent(q)}`);
      }
      playlistEndpoints.push(`https://synctube-2ar4.onrender.com/api/youtube/playlist?url=${encodeURIComponent(q)}`);

      for (const pUrl of playlistEndpoints) {
        try {
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), 8000);
          const resp = await fetch(pUrl, { signal: controller.signal });
          clearTimeout(timer);
          if (resp.ok) {
            const data = await resp.json();
            if (Array.isArray(data.videos) && data.videos.length > 0) {
              setPlaylistInfo({
                title: data.title || 'YouTube Playlist',
                count: data.videos.length,
                items: data.videos,
              });
              setResults(data.videos);
              setIsLoading(false);
              return;
            }
          }
        } catch {}
      }
    } else {
      setPlaylistInfo(null);
    }

    const directId = extractYouTubeId(q);
    if (directId) {
      const directItem: SearchResultItem = {
        videoId: directId,
        title: `YouTube Video (${directId})`,
        channel: 'YouTube',
        duration: '',
        thumbnail: `https://img.youtube.com/vi/${directId}/hqdefault.jpg`,
      };
      setResults([directItem]);
    }

    setIsLoading(true);

    const endpointsToTry: string[] = [];
    const primaryApiUrl = getApiUrl();
    if (primaryApiUrl) {
      endpointsToTry.push(`${primaryApiUrl}/api/youtube/search?q=${encodeURIComponent(q)}`);
    } else {
      endpointsToTry.push(`/api/youtube/search?q=${encodeURIComponent(q)}`);
    }

    const alreadyHasFallback = endpointsToTry.some((endpoint) => {
      try {
        return new URL(endpoint, window.location.origin).hostname === 'synctube-2ar4.onrender.com';
      } catch {
        return false;
      }
    });
    if (!alreadyHasFallback) {
      endpointsToTry.push(`https://synctube-2ar4.onrender.com/api/youtube/search?q=${encodeURIComponent(q)}`);
    }

    let loadedVideos: SearchResultItem[] | null = null;

    for (const url of endpointsToTry) {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 6000);
        const resp = await fetch(url, { signal: controller.signal });
        clearTimeout(timer);
        if (resp.ok) {
          const data = await resp.json();
          if (Array.isArray(data.results) && data.results.length > 0) {
            loadedVideos = data.results;
            break;
          }
        }
      } catch {}
    }

    if (loadedVideos && loadedVideos.length > 0) {
      setResults(loadedVideos);
      setIsLoading(false);
      return;
    }

    const lower = q.toLowerCase();
    const matched = CLIENT_FALLBACK_CATALOGUE.filter(
      (v) =>
        v.title.toLowerCase().includes(lower) ||
        (v.channel && v.channel.toLowerCase().includes(lower))
    );

    if (matched.length > 0) {
      setResults(matched);
    } else if (directId) {
      // already set
    } else {
      setResults(CLIENT_FALLBACK_CATALOGUE.slice(0, 6));
    }

    setIsLoading(false);
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    performSearch(query);
  };

  const handlePlayNow = (item: SearchResultItem) => {
    if (userRole === 'HOST' || userRole === 'MODERATOR') {
      onPlayVideo(item.videoId);
      onNotify(`Playing "${item.title.substring(0, 30)}..."`, 'success');
      onClose();
    } else if (onRequestAction) {
      onRequestAction('change_video', {
        videoId: item.videoId,
        title: item.title,
        duration: item.duration,
        channel: item.channel,
      });
      onNotify('Play request sent to Host for approval!', 'info');
      onClose();
    } else {
      onNotify('Only Hosts and Moderators can switch videos directly.', 'error');
    }
  };

  const handleRequestNext = (item: SearchResultItem) => {
    if (userRole === 'HOST' || userRole === 'MODERATOR') {
      onAddToPlaylist(item.videoId, item.title, item.duration, item.channel, item.thumbnail);
      onNotify(`Added "${item.title.substring(0, 25)}..." to playlist`, 'success');
      onClose();
    } else if (onRequestAction) {
      onRequestAction('request_next_video', {
        videoId: item.videoId,
        title: item.title,
        duration: item.duration,
        channel: item.channel,
      });
      onNotify('Request to play this video next sent to Host!', 'success');
      onClose();
    } else {
      onNotify('Could not send request at this time.', 'error');
    }
  };

  const handleQueue = (item: SearchResultItem) => {
    onAddToPlaylist(item.videoId, item.title, item.duration, item.channel, item.thumbnail);
    onNotify(`Added "${item.title.substring(0, 25)}..." to queue`, 'success');
  };

  if (!isOpen) return null;

  return (
    <div className={inline ? 'sidebar-youtube-search' : 'modal-backdrop'} onClick={inline ? undefined : onClose}>
      <div className={inline ? 'sidebar-youtube-search-body' : 'glass-panel modal-card yt-search-modal-card'} onClick={(e) => e.stopPropagation()}>
        {!inline && (
          <div className="modal-header yt-search-modal-header">
            <div className="yt-search-modal-title">
              <Search size={20} color="var(--accent)" />
              <h2>Search YouTube Videos</h2>
            </div>
            <button type="button" className="btn-icon" onClick={onClose} title="Close">
              <X size={18} />
            </button>
          </div>
        )}
        <div className={inline ? 'yt-search-modal-body sidebar-youtube-search-content' : 'modal-body yt-search-modal-body'}>
          <form onSubmit={handleSearchSubmit} className="yt-search-form">
            <div className="yt-search-input-wrap">
              <Search size={18} className="yt-search-icon" />
              <input
                ref={inputRef}
                type="text"
                className="input-field yt-search-input"
                placeholder="Search songs, titles, or paste YouTube link..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              {isLoading && <Loader2 size={18} className="spin-icon yt-search-loader" />}
            </div>
            <button type="submit" className="btn btn-primary yt-search-submit-btn" disabled={isLoading || !query.trim()}>
              Search
            </button>
          </form>

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

          <div className="yt-search-results">
            {playlistInfo && (
              <div
                className="yt-search-playlist-banner"
                style={{
                  background: 'rgba(99, 102, 241, 0.12)',
                  border: '1px solid rgba(99, 102, 241, 0.3)',
                  borderRadius: '12px',
                  padding: '12px 16px',
                  marginBottom: '14px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '12px',
                  flexWrap: 'wrap',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div
                    style={{
                      width: '36px',
                      height: '36px',
                      borderRadius: '8px',
                      background: 'rgba(99, 102, 241, 0.25)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#818cf8',
                    }}
                  >
                    <ListMusic size={20} />
                  </div>
                  <div>
                    <div style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: '14px' }}>
                      {playlistInfo.title}
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                      YouTube Playlist • {playlistInfo.items.length} tracks
                    </div>
                  </div>
                </div>
                {userRole !== 'PARTICIPANT' && onAddPlaylistBatch && (
                  <button
                    type="button"
                    className="btn btn-primary"
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                      padding: '7px 14px',
                      fontSize: '13px',
                      fontWeight: 600,
                    }}
                    onClick={() => {
                      onAddPlaylistBatch(playlistInfo.items);
                      onNotify(`Added ${playlistInfo.items.length} videos from playlist!`, 'success');
                      onClose();
                    }}
                  >
                    <Plus size={15} />
                    <span>Add All ({playlistInfo.items.length}) to Queue</span>
                  </button>
                )}
              </div>
            )}

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
                      src={getSafeYouTubeThumbnailUrl(item.thumbnail, item.videoId)}
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
                    <span className="yt-search-item-id">
                      {item.channel ? `${item.channel} • ` : ''}ID: {item.videoId}
                    </span>
                  </div>
                  <div className="yt-search-item-actions">
                    {userRole === 'PARTICIPANT' ? (
                      <>
                        <button
                          type="button"
                          className="btn btn-secondary yt-btn-action"
                          onClick={() => handleRequestNext(item)}
                          title="Request host to play this next"
                        >
                          <SkipForward size={14} />
                          <span>Request Next</span>
                        </button>
                        <button
                          type="button"
                          className="btn btn-primary yt-btn-action"
                          onClick={() => handlePlayNow(item)}
                          title="Request host to play now"
                        >
                          <Play size={14} />
                          <span>Play Now</span>
                        </button>
                      </>
                    ) : (
                      <>
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
                          onClick={() => handlePlayNow(item)}
                          title="Play Immediately"
                        >
                          <Play size={15} />
                          <span>Play</span>
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ))}
          </div>
        </div>
      </div>
    </div>
  );
};
