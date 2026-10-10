import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Play,
  Plus,
  Loader2,
  Film,
  Tv,
  Sparkles,
  Calendar,
  Clock,
  Layers,
  X,
  Flame,
  Gauge,
  Rocket,
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
  /** Numeric pixel height when known (e.g. 1080). */
  height?: number;
  /** True when this entry is the adaptive DASH manifest (ABR quality ladder). */
  adaptive?: boolean;
  codec?: string;
  sizeBytes?: number;
  streamUrl: string;
  proxiedUrl: string;
}

export interface MovieQualityItem {
  label: string;
  height: number;
  adaptive: boolean;
}

type BrowseCategory = 'trending' | 'movies' | 'series' | 'anime';

interface ResolvedStreams {
  streams: MovieStreamItem[];
  qualities: MovieQualityItem[];
  adaptive: boolean;
}

interface PendingPlay extends ResolvedStreams {
  item: MovieSearchResultItem;
  season: number;
  episode: number;
  title: string;
}

interface QualityRow {
  key: string;
  label: string;
  stream: MovieStreamItem;
  /** When set, the adaptive manifest is locked to this pixel height via ?quality=. */
  lockHeight?: number;
  chips: string[];
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

const BROWSE_CATEGORIES: Array<{ id: BrowseCategory; label: string; icon: React.ReactNode }> = [
  { id: 'trending', label: '🔥 Trending', icon: <Flame size={12} /> },
  { id: 'movies', label: '🎬 Movies', icon: <Film size={12} /> },
  { id: 'series', label: '📺 Web Series', icon: <Tv size={12} /> },
  { id: 'anime', label: '🍥 Anime', icon: <Sparkles size={12} /> },
];

const GENRE_CHIPS = [
  'Action',
  'Sci-Fi',
  'Horror',
  'Comedy',
  'Drama',
  'Inception',
  'Interstellar',
  'Stranger Things',
];

function formatSize(bytes?: number): string {
  if (!bytes || !Number.isFinite(bytes) || bytes <= 0) return '';
  const gb = bytes / (1024 ** 3);
  if (gb >= 1) return `${gb.toFixed(1)} GB`;
  const mb = bytes / (1024 ** 2);
  if (mb >= 1) return `${mb.toFixed(0)} MB`;
  return `${Math.round(bytes / 1024)} KB`;
}

function qualityChips(stream: MovieStreamItem, adaptive: boolean): string[] {
  const chips: string[] = [];
  if (adaptive) chips.push('ABR Auto');
  chips.push((stream.format || 'MP4').toUpperCase());
  if (stream.codec) chips.push(stream.codec.toUpperCase());
  const size = formatSize(stream.sizeBytes);
  if (size) chips.push(size);
  return chips;
}

/**
 * Build the YouTube-style quality ladder for a resolved title:
 * [Auto (adaptive)] + 4K/1080p/720p/... rungs, each mapped to a playable stream.
 */
function buildQualityRows(resolved: ResolvedStreams): QualityRow[] {
  const { streams, qualities, adaptive } = resolved;
  const adaptiveStream = streams.find((s) => s.adaptive);
  const rows: QualityRow[] = [];

  if (adaptive && adaptiveStream) {
    rows.push({
      key: 'auto',
      label: 'Auto',
      stream: adaptiveStream,
      chips: qualityChips(adaptiveStream, true),
    });
  }

  const ladder: MovieQualityItem[] =
    qualities.length > 0
      ? qualities
      : [...new Set(streams.map((s) => s.height).filter((h): h is number => Boolean(h)))]
          .sort((a, b) => b - a)
          .map((h) => ({
            label: `${h}p`,
            height: h,
            adaptive: !streams.some((s) => s.height === h && !s.adaptive),
          }));

  for (const q of ladder) {
    const exact = streams.find((s) => s.height === q.height && !s.adaptive);
    const stream = exact || (q.adaptive ? adaptiveStream : undefined);
    if (!stream) continue;
    const lockHeight = exact ? undefined : q.height;
    const row: QualityRow = {
      key: `q-${q.height}`,
      label: q.label,
      stream,
      lockHeight,
      chips: qualityChips(stream, Boolean(lockHeight)),
    };
    rows.push(row);
  }

  // De-duplicate keys (auto row can share the underlying stream with a rung)
  const seen = new Set<string>();
  return rows.filter((r) => (seen.has(r.key) ? false : (seen.add(r.key), true)));
}

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
  const [activeCategory, setActiveCategory] = useState<BrowseCategory>('trending');
  // true when the grid shows free-text search results instead of a browse category
  const [searchMode, setSearchMode] = useState(false);

  // Series episode selector modal state
  const [selectedSeries, setSelectedSeries] = useState<MovieSearchResultItem | null>(null);
  const [seriesDetailsLoading, setSeriesDetailsLoading] = useState(false);
  const [seriesSeasons, setSeriesSeasons] = useState<Array<{ seasonNumber: number; episodeCount: number }>>([]);
  const [activeSeason, setActiveSeason] = useState<number>(1);

  // Quality picker modal state (YouTube-style quality menu before playback)
  const [pendingPlay, setPendingPlay] = useState<PendingPlay | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    if (results.length === 0 && !query) {
      loadCategory('trending');
    }
  }, []);

  const loadCategory = async (category: BrowseCategory) => {
    setIsLoading(true);
    setActiveCategory(category);
    setSearchMode(false);
    const base = getApiUrl() || '';
    try {
      const res = await fetch(`${base}/api/movies/browse?type=${category}`, {
        signal: AbortSignal.timeout(12000),
      });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.results)) {
          setResults(data.results);
          if (data.results.length === 0) {
            onNotify('Nothing found in this category right now. Try another tab.', 'info');
          }
        }
      } else {
        onNotify('Could not load this category. Please try again.', 'error');
      }
    } catch {
      onNotify('Could not connect to the cinema service.', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const performSearch = async (searchTerm: string) => {
    const q = searchTerm.trim();
    if (!q) return;

    setIsLoading(true);
    setSearchMode(true);
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
    if (!query.trim()) return;
    performSearch(query);
  };

  const buildEpisodeTitle = (item: MovieSearchResultItem, season: number, episode: number): string =>
    season > 0 && episode > 0
      ? `${item.title} S${String(season).padStart(2, '0')}E${String(episode).padStart(2, '0')}`
      : item.title;

  const resolveStreams = async (
    item: MovieSearchResultItem,
    season: number,
    episode: number
  ): Promise<ResolvedStreams | null> => {
    const base = getApiUrl() || '';
    const streamQuery =
      season > 0 && episode > 0
        ? `id=${encodeURIComponent(item.id)}&season=${season}&episode=${episode}`
        : `id=${encodeURIComponent(item.id)}`;

    const res = await fetch(`${base}/api/movies/streams?${streamQuery}`);
    if (!res.ok) {
      throw new Error('Failed to fetch stream links');
    }
    const data = await res.json();
    const streams: MovieStreamItem[] = Array.isArray(data.streams) ? data.streams : [];
    if (streams.length === 0) return null;

    return {
      streams,
      qualities: Array.isArray(data.availableQualities) ? data.availableQualities : [],
      adaptive: Boolean(data.adaptive),
    };
  };

  const executePlay = (stream: MovieStreamItem, title: string, lockHeight?: number, duration?: string) => {
    let streamUrl = stream.proxiedUrl.startsWith('http')
      ? stream.proxiedUrl
      : `${window.location.origin}${stream.proxiedUrl}`;

    // Lock the adaptive (DASH) ladder to the chosen rung — mirrors YouTube quality selection
    if (lockHeight && stream.adaptive) {
      streamUrl += `${streamUrl.includes('?') ? '&' : '?'}quality=${lockHeight}`;
    }

    if (userRole === 'HOST' || userRole === 'MODERATOR') {
      onPlayStream(streamUrl, title);
      const suffix = lockHeight ? ` at ${lockHeight}p` : stream.adaptive ? ' on Auto quality' : ` at ${stream.resolution}`;
      onNotify(`Playing "${title}"${suffix} in the room! 🎬🍿`, 'success');
      if (onCloseModal) onCloseModal();
    } else if (onRequestAction) {
      onRequestAction('change_video', {
        videoId: streamUrl,
        title,
        duration,
        channel: 'MovieBox Cinema',
      });
      onNotify('Stream request sent to Host for approval!', 'info');
      if (onCloseModal) onCloseModal();
    } else {
      onNotify('Only Hosts and Moderators can start movie playback.', 'error');
    }
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

    // Resolve live stream links (MovieBox play-info + resources)
    setResolvingId(`${item.id}_${season}_${episode}`);
    try {
      const resolved = await resolveStreams(item, season, episode);
      if (!resolved) {
        onNotify('No playable streams available for this title.', 'error');
        return;
      }

      const title = buildEpisodeTitle(item, season, episode);
      const rows = buildQualityRows(resolved);

      if (rows.length === 0) {
        onNotify('No playable streams available for this title.', 'error');
        return;
      }

      if (rows.length === 1) {
        // Single quality — play immediately without the picker
        executePlay(rows[0].stream, title, rows[0].lockHeight, item.duration);
        return;
      }

      // Multiple qualities → show the quality picker (like YouTube's quality menu)
      setSelectedSeries(null);
      setPendingPlay({ ...resolved, item, season, episode, title });
    } catch {
      onNotify('Could not resolve stream URL for this movie.', 'error');
    } finally {
      setResolvingId(null);
    }
  };

  const handleQualityPick = (row: QualityRow) => {
    if (!pendingPlay) return;
    const { title, item } = pendingPlay;
    setPendingPlay(null);
    executePlay(row.stream, title, row.lockHeight, item.duration);
  };

  const handleQueueMedia = async (item: MovieSearchResultItem, season = 0, episode = 0) => {
    setResolvingId(`${item.id}_${season}_${episode}_q`);
    try {
      const resolved = await resolveStreams(item, season, episode);
      if (!resolved) {
        onNotify('No stream available to queue.', 'error');
        return;
      }
      const best = resolved.streams[0];
      const streamUrl = best.proxiedUrl.startsWith('http')
        ? best.proxiedUrl
        : `${window.location.origin}${best.proxiedUrl}`;

      const title = buildEpisodeTitle(item, season, episode);
      onAddToPlaylist(streamUrl, title, item.duration, 'MovieBox Cinema', item.coverUrl);
      onNotify(`Added "${title}" to room playlist!`, 'success');
    } catch {
      onNotify('Failed to queue stream.', 'error');
    } finally {
      setResolvingId(null);
    }
  };

  const qualityRows = useMemo(() => (pendingPlay ? buildQualityRows(pendingPlay) : []), [pendingPlay]);

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

      {/* Category Browse Tabs (movies / web series / anime — MovieBox catalogue) */}
      <div className="movie-category-bar" role="tablist" aria-label="Cinema categories">
        {BROWSE_CATEGORIES.map((cat) => (
          <button
            key={cat.id}
            type="button"
            role="tab"
            aria-selected={!searchMode && activeCategory === cat.id}
            className={`yt-preset-pill movie-cat-pill ${!searchMode && activeCategory === cat.id ? 'active' : ''}`}
            onClick={() => {
              setQuery('');
              loadCategory(cat.id);
            }}
          >
            {cat.icon}
            <span>{cat.label}</span>
          </button>
        ))}
      </div>

      {/* Genre quick chips (free-text search) */}
      <div className="yt-search-presets">
        {GENRE_CHIPS.map((tag) => (
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
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      title="Add to Playlist"
                      disabled={isResolving}
                      onClick={() => handleQueueMedia(item)}
                    >
                      <Plus size={13} />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
      </div>

      {/* Quality Picker Overlay (YouTube-style: Auto / 4K / 1080p / 720p ...) */}
      {pendingPlay && (
        <div className="series-episodes-overlay" onClick={() => setPendingPlay(null)}>
          <div
            className="series-episodes-card quality-picker-card"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="series-episodes-header">
              <div>
                <h3 className="series-episodes-title">{pendingPlay.title}</h3>
                <span className="series-episodes-subtitle">Select video quality</span>
              </div>
              <button
                type="button"
                className="btn-icon"
                onClick={() => setPendingPlay(null)}
                title="Close"
              >
                <X size={18} />
              </button>
            </div>

            <div className="quality-options-list">
              {qualityRows.map((row) => (
                <button
                  key={row.key}
                  type="button"
                  className="quality-option-btn"
                  onClick={() => handleQualityPick(row)}
                >
                  <span className="quality-option-main">
                    <span className="quality-option-label">
                      {row.key === 'auto' ? (
                        <>
                          <Gauge size={14} /> Auto
                        </>
                      ) : (
                        row.label
                      )}
                    </span>
                    <span className="quality-option-chips">
                      {row.chips.map((chip) => (
                        <span
                          key={chip}
                          className={`quality-chip ${chip === 'ABR Auto' ? 'quality-chip-adaptive' : ''}`}
                        >
                          {chip}
                        </span>
                      ))}
                    </span>
                  </span>
                  <span className="quality-option-action">
                    <Play size={14} />
                    <span>Play</span>
                  </span>
                </button>
              ))}
            </div>

            <p className="quality-picker-hint">
              <Rocket size={12} /> Quality is applied locally for you — the room stays in sync. Auto
              adapts to your connection like YouTube.
            </p>
          </div>
        </div>
      )}

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
