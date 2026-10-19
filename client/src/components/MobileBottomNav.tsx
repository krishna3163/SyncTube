import React from 'react';
import { Tv, MessageSquare, ListMusic, Users, Volume2, SlidersHorizontal, MoreHorizontal } from 'lucide-react';

export type MobileTab = 'stage' | 'chat' | 'playlist' | 'viewers' | 'soundboard' | 'more';

interface MobileBottomNavProps {
  activeTab: MobileTab;
  onSelectTab: (tab: MobileTab) => void;
  viewerCount: number;
  playlistCount: number;
  hasUnreadChat?: boolean;
}

export const MobileBottomNav: React.FC<MobileBottomNavProps> = ({
  activeTab,
  onSelectTab,
  viewerCount,
  playlistCount,
  hasUnreadChat = false,
}) => {
  return (
    <nav className="mobile-bottom-nav" aria-label="Mobile Watch Party Navigation">
      <div className="mobile-bottom-nav-inner">
        {/* 1. Video Stage Tab */}
        <button
          type="button"
          className={`mobile-nav-btn ${activeTab === 'stage' ? 'active' : ''}`}
          onClick={() => onSelectTab('stage')}
          aria-label="Video Stage"
          aria-selected={activeTab === 'stage'}
        >
          <Tv size={20} />
          <span className="mobile-nav-label">Stage</span>
        </button>

        {/* 2. Chat Tab */}
        <button
          type="button"
          className={`mobile-nav-btn ${activeTab === 'chat' ? 'active' : ''}`}
          onClick={() => onSelectTab('chat')}
          aria-label="Live Chat"
          aria-selected={activeTab === 'chat'}
        >
          <div className="mobile-nav-icon-wrap">
            <MessageSquare size={20} />
            {hasUnreadChat && <span className="mobile-nav-dot" aria-label="New messages" />}
          </div>
          <span className="mobile-nav-label">Chat</span>
        </button>

        {/* 3. Playlist Tab */}
        <button
          type="button"
          className={`mobile-nav-btn ${activeTab === 'playlist' ? 'active' : ''}`}
          onClick={() => onSelectTab('playlist')}
          aria-label="Party Playlist"
          aria-selected={activeTab === 'playlist'}
        >
          <div className="mobile-nav-icon-wrap">
            <ListMusic size={20} />
            {playlistCount > 0 && (
              <span className="mobile-nav-badge">{playlistCount}</span>
            )}
          </div>
          <span className="mobile-nav-label">Playlist</span>
        </button>

        {/* 4. Viewers Tab */}
        <button
          type="button"
          className={`mobile-nav-btn ${activeTab === 'viewers' ? 'active' : ''}`}
          onClick={() => onSelectTab('viewers')}
          aria-label="Participants & Viewers"
          aria-selected={activeTab === 'viewers'}
        >
          <div className="mobile-nav-icon-wrap">
            <Users size={20} />
            <span className="mobile-nav-badge">{viewerCount}</span>
          </div>
          <span className="mobile-nav-label">Viewers</span>
        </button>

        {/* 5. Soundboard Tab */}
        <button
          type="button"
          className={`mobile-nav-btn ${activeTab === 'soundboard' ? 'active' : ''}`}
          onClick={() => onSelectTab('soundboard')}
          aria-label="Party Soundboard"
          aria-selected={activeTab === 'soundboard'}
        >
          <Volume2 size={20} />
          <span className="mobile-nav-label">Sounds</span>
        </button>

        {/* 6. More Actions Tab */}
        <button
          type="button"
          className={`mobile-nav-btn ${activeTab === 'more' ? 'active' : ''}`}
          onClick={() => onSelectTab('more')}
          aria-label="More Room Options"
          aria-selected={activeTab === 'more'}
        >
          <MoreHorizontal size={20} />
          <span className="mobile-nav-label">More</span>
        </button>
      </div>
    </nav>
  );
};
