import React, { useState, useEffect, useRef } from 'react';
import {
  Search,
  Play,
  Plus,
  Loader2,
  Film,
  Tv,
  Sparkles,
  Calendar,
  Clock,
  Layers,
  ChevronRight,
  X,
  Check,
} from 'lucide-react';
import { Role } from '../types.js';
import { getApiUrl } from '../pages/HomePage.js';

export interface MovieSearchResultItem {
  id: string;
  title: string;
  mediaType: 'movie' | 'series';
  year?: string;
  duration?: string;
  genre?: string;
  coverUrl?: string;
  seasonCount?: number;
}

export interface MovieStreamItem {
  id: string;
  title: string;
  format: string;
  resolution: string;
  codec?: string;
  sizeBytes?: number;
  streamUrl: string;
  proxiedUrl: string;
}

interface MovieSearchTabProps {
  userRole: Role;
  onPlayStream: (streamUrl: string, title: string) => void;
  onAddToPlaylist: (streamUrl: string, title: string, duration?: string, channel?: string, thumbnail?: string) => void;
  onRequestAction?: (
    type: 'change_video' | 'request_next_video',
    data: { videoId: string; title?: string; duration?: string; channel?: string }
  ) => void;
  onNotify: (msg: string, type: 'info' | 'success' | 'error') => void;
  onCloseModal?: () => void;
}

const PRESET_MOVIES = [
  'Avatar',
  'Inception',
  'Interstellar',
  'Breaking Bad',
  'The Matrix',
  'Stranger Things',
  'Avengers',
  'Spider-Man',
];

export const MovieSearchTab: React.FC<MovieSearchTabProps> = ({
  userRole,
  onPlayStream,
  onAddToPlaylist,
  onRequestAction,
  onNotify,
  onCloseModal,
}) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<MovieSearchResultItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [resolvingId, setResolvingId] = useState<string | null>(null);

  // Series episode selector modal state
  const [selectedSeries, setSelectedSeries] = useState<MovieSearchResultItem | null>(null);
  const [seriesDetailsLoading, setSeriesDetailsLoading] = useState(false);
  const [seriesSeasons, setSeriesSeasons] = useState<Array<{ seasonNumber: number; episodeCount: number }>>([]);
  const [activeSeason, setActiveSeason] = useState<number>(1);

  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    if (results.length === 0 && !query) {
      performSearch('Inception');
    }
  }, []);

  const performSearch = async (searchTerm: string) => {
    const q = searchTerm.trim();
    if (!q) return;

    setIsLoading(true);
    const base = getApiUrl() || '';
    const url = `${base}/api/movies/search?q=${encodeURIComponent(q)}`;

    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.results)) {
          setResults(data.results);
        }
      } else {
        onNotify('Movie search failed. Please try another query.', 'error');
      }
    } catch {
      onNotify('Could not connect to MovieBox service.', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    performSearch(query);
  };

  const handleSelectMedia = async (item: MovieSearchResultItem, season = 0, episode = 0) => {
    if (item.mediaType === 'series' && season === 0) {
      // Open series episode selector
      setSelectedSeries(item);
      setSeriesDetailsLoading(true);
      const base = getApiUrl() || '';
      try {
        const detRes = await fetch(`${base}/api/movies/details/${encodeURIComponent(item.id)}`);
        if (detRes.ok) {
          const detData = await detRes.json();
          const seasons = detData.details?.seasons;
          if (Array.isArray(seasons) && seasons.length > 0) {
            setSeriesSeasons(seasons);
            setActiveSeason(seasons[0].seasonNumber);
          } else {
            setSeriesSeasons([{ seasonNumber: 1, episodeCount: item.seasonCount || 10 }]);
            setActiveSeason(1);
          }
        }
      } catch {
        setSeriesSeasons([{ seasonNumber: 1, episodeCount: item.seasonCount || 8 }]);
        setActiveSeason(1);
      } finally {
        setSeriesDetailsLoading(false);
      }
      return;
    }

    // Resolve streams
    setResolvingId(`${item.id}_${season}_${episode}`);
    const base = getApiUrl() || '';
    const streamQuery =
      season > 0 && episode > 0
        ? `id=${encodeURIComponent(item.id)}&season=${season}&episode=${episode}`
        : `id=${encodeURIComponent(item.id)}`;

    try {
      const res = await fetch(`${base}/api/movies/streams?${streamQuery}`);
      if (!res.ok) {
        throw new Error('Failed to fetch stream links');
      }
      const data = await res.json();
      const streams: MovieStreamItem[] = data.streams || [];
      if (streams.length === 0) {
        onNotify('No playable streams available for this title.', 'error');
        return;
      }

      // Pick highest quality stream
      const bestStream = streams[0];
      const streamUrl = bestStream.proxiedUrl.startsWith('http')
        ? bestStream.proxiedUrl
        : `${window.location.origin}${bestStream.proxiedUrl}`;

      const title =
        season > 0 && episode > 0
          ? `${item.title} S${String(season).padStart(2, '0')}E${String(episode).padStart(2, '0')}`
          : item.title;

      if (userRole === 'HOST' || userRole === 'MODERATOR') {
        onPlayStream(streamUrl, title);
        onNotify(`Playing "${title}" in the room! 🎬🍿`, 'success');
        if (onCloseModal) onCloseModal();
      } else if (onRequestAction) {
        onRequestAction('change_video', {
          videoId: streamUrl,
          title,
          duration: item.duration,
          channel: 'MovieBox Cinema',
        });
        onNotify('Stream request sent to Host for approval!', 'info');
        if (onCloseModal) onCloseModal();
      } else {
        onNotify('Only Hosts and Moderators can start movie playback.', 'error');
      }
    } catch {
      onNotify('Could not resolve stream URL for this movie.', 'error');
    } finally {
      setResolvingId(null);
    }
  };

  const handleQueueMedia = async (item: MovieSearchResultItem, season = 0, episode = 0) => {
    setResolvingId(`${item.id}_${season}_${episode}_q`);
    const base = getApiUrl() || '';
    const streamQuery =
      season > 0 && episode > 0
        ? `id=${encodeURIComponent(item.id)}&season=${season}&episode=${episode}`
        : `id=${encodeURIComponent(item.id)}`;

    try {
      const res = await fetch(`${base}/api/movies/streams?${streamQuery}`);
      const data = await res.json();
      const streams: MovieStreamItem[] = data.streams || [];
      if (streams.length === 0) {
        onNotify('No stream available to queue.', 'error');
        return;
      }
      const best = streams[0];
      const streamUrl = best.proxiedUrl.startsWith('http')
        ? best.proxiedUrl
        : `${window.location.origin}${best.proxiedUrl}`;

      const title =
        season > 0 && episode > 0
          ? `${item.title} S${String(season).padStart(2, '0')}E${String(episode).padStart(2, '0')}`
          : item.title;

      onAddToPlaylist(streamUrl, title, item.duration, 'MovieBox Cinema', item.coverUrl);
      onNotify(`Added "${title}" to room playlist!`, 'success');
    } catch {
      onNotify('Failed to queue stream.', 'error');
    } finally {
      setResolvingId(null);
    }
  };

  return (
    <div className="movie-search-tab-container">
      {/* Search Bar */}
      <form onSubmit={handleSearchSubmit} className="yt-search-form">
        <div className="yt-search-input-wrap">
          <Film size={18} className="yt-search-icon" color="var(--accent)" />
          <input
            ref={inputRef}
            type="text"
            className="input-field yt-search-input"
            placeholder="Search movies, web series, anime... (e.g. Inception, Avatar, Breaking Bad)"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {isLoading && <Loader2 size={18} className="spin-icon yt-search-loader" />}
        </div>
        <button
          type="submit"
          className="btn btn-primary yt-search-submit-btn"
          disabled={isLoading || !query.trim()}
        >
          Search
        </button>
      </form>

      {/* Preset Pills */}
      <div className="yt-search-presets">
        {PRESET_MOVIES.map((tag) => (
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

      {/* Movie Results Grid */}
      <div className="movie-search-results-grid">
        {isLoading && (
          <div className="yt-search-loading" style={{ gridColumn: '1 / -1' }}>
            <Loader2 size={28} className="spin-icon" color="var(--accent)" />
            <p>Searching MovieBox catalog...</p>
          </div>
        )}

        {!isLoading && results.length === 0 && (
          <div className="yt-search-empty" style={{ gridColumn: '1 / -1' }}>
            <p>No movies or series found. Try a different title or keyword.</p>
          </div>
        )}

        {!isLoading &&
          results.map((item) => {
            const isResolving = resolvingId?.startsWith(item.id);
            return (
              <div key={item.id} className="movie-card glass-panel">
                <div className="movie-card-poster-wrap">
                  {item.coverUrl ? (
                    <img
                      src={item.coverUrl}
                      alt={item.title}
                      className="movie-card-poster"
                      loading="lazy"
                      onError={(e) => {
                        (e.currentTarget as HTMLElement).style.display = 'none';
                      }}
                    />
                  ) : (
                    <div className="movie-card-poster-placeholder">
                      {item.mediaType === 'series' ? <Tv size={32} /> : <Film size={32} />}
                    </div>
                  )}
                  <span
                    className={`movie-card-badge ${
                      item.mediaType === 'series' ? 'badge-series' : 'badge-movie'
                    }`}
                  >
                    {item.mediaType === 'series' ? 'TV Series' : 'Movie'}
                  </span>
                </div>

                <div className="movie-card-info">
                  <h3 className="movie-card-title" title={item.title}>
                    {item.title}
                  </h3>
                  <div className="movie-card-meta">
                    {item.year && (
                      <span className="movie-meta-item">
                        <Calendar size={11} /> {item.year}
                      </span>
                    )}
                    {item.duration && (
                      <span className="movie-meta-item">
                        <Clock size={11} /> {item.duration}
                      </span>
                    )}
                    {item.mediaType === 'series' && item.seasonCount && (
                      <span className="movie-meta-item">
                        <Layers size={11} /> {item.seasonCount} Seasons
                      </span>
                    )}
                  </div>
                  {item.genre && (
                    <p className="movie-card-genre" title={item.genre}>
                      {item.genre}
                    </p>
                  )}

                  <div className="movie-card-actions">
                    <button
                      type="button"
                      className="btn btn-primary btn-sm movie-play-btn"
                      disabled={isResolving}
                      onClick={() => handleSelectMedia(item)}
                    >
                      {isResolving ? (
                        <Loader2 size={13} className="spin-icon" />
                      ) : item.mediaType === 'series' ? (
                        <Layers size={13} />
                      ) : (
                        <Play size={13} />
                      )}
                      <span>{item.mediaType === 'series' ? 'Episodes' : 'Play in Room'}</span>
                    </button>
                    {item.mediaType === 'movie' && (
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        title="Add to Playlist"
                        disabled={isResolving}
                        onClick={() => handleQueueMedia(item)}
                      >
                        <Plus size={13} />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
      </div>

      {/* Series Season & Episode Modal Overlay */}
      {selectedSeries && (
        <div className="series-episodes-overlay" onClick={() => setSelectedSeries(null)}>
          <div
            className="series-episodes-card glass-panel"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="series-episodes-header">
              <div>
                <h3 className="series-episodes-title">{selectedSeries.title}</h3>
                <span className="series-episodes-subtitle">Select Season & Episode to Stream</span>
              </div>
              <button
                type="button"
                className="btn-icon"
                onClick={() => setSelectedSeries(null)}
                title="Close"
              >
                <X size={18} />
              </button>
            </div>

            {seriesDetailsLoading ? (
              <div className="series-episodes-loading">
                <Loader2 size={24} className="spin-icon" color="var(--accent)" />
                <p>Loading episodes...</p>
              </div>
            ) : (
              <>
                {/* Season tabs */}
                <div className="series-season-tabs">
                  {seriesSeasons.map((s) => (
                    <button
                      key={s.seasonNumber}
                      type="button"
                      className={`season-tab-btn ${activeSeason === s.seasonNumber ? 'active' : ''}`}
                      onClick={() => setActiveSeason(s.seasonNumber)}
                    >
                      Season {s.seasonNumber}
                    </button>
                  ))}
                </div>

                {/* Episodes grid */}
                <div className="series-episodes-list">
                  {(() => {
                    const currentSeason =
                      seriesSeasons.find((s) => s.seasonNumber === activeSeason) || seriesSeasons[0];
                    const epCount = currentSeason?.episodeCount || 8;
                    const epIndices = Array.from({ length: epCount }, (_, i) => i + 1);

                    return epIndices.map((epNum) => {
                      const isThisResolving =
                        resolvingId === `${selectedSeries.id}_${activeSeason}_${epNum}`;
                      return (
                        <div key={epNum} className="series-episode-item">
                          <span className="episode-item-label">
                            S{String(activeSeason).padStart(2, '0')}E{String(epNum).padStart(2, '0')}
                          </span>
                          <div className="episode-item-btns">
                            <button
                              type="button"
                              className="btn btn-primary btn-sm"
                              disabled={isThisResolving}
                              onClick={() => handleSelectMedia(selectedSeries, activeSeason, epNum)}
                            >
                              {isThisResolving ? (
                                <Loader2 size={12} className="spin-icon" />
                              ) : (
                                <Play size={12} />
                              )}
                              <span>Play</span>
                            </button>
                            <button
                              type="button"
                              className="btn btn-secondary btn-sm"
                              title="Add episode to playlist"
                              disabled={isThisResolving}
                              onClick={() => handleQueueMedia(selectedSeries, activeSeason, epNum)}
                            >
                              <Plus size={12} />
                            </button>
                          </div>
                        </div>
                      );
                    });
                  })()}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
