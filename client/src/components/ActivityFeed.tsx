import React, { useState } from 'react';
import { Play, Plus, Check, ChevronDown, Sparkles } from 'lucide-react';
import { ActivityItem } from '../types.js';
import { AnimeAvatarDisplay } from './AnimeAvatar.js';
import { getParticipantCharacterId } from '../utils/characterMemory.js';

interface ActivityFeedProps {
  activities: ActivityItem[];
}

type ActivityFilter = 'All' | 'Playback' | 'Playlist' | 'Requests' | 'Joins';

export const ActivityFeed: React.FC<ActivityFeedProps> = ({ activities }) => {
  const [filter, setFilter] = useState<ActivityFilter>('All');
  const [isFilterOpen, setIsFilterOpen] = useState(false);

  const filteredActivities = activities.filter((item) => {
    if (filter === 'All') return true;
    if (filter === 'Playback') return item.type === 'playback';
    if (filter === 'Playlist') return item.type === 'playlist';
    if (filter === 'Requests') {
      return (
        item.type === 'request_approved' ||
        item.type === 'video_requested' ||
        item.text.toLowerCase().includes('request')
      );
    }
    if (filter === 'Joins') return item.type === 'joined' || item.type === 'left';
    return true;
  });

  const renderTimelineNode = (item: ActivityItem) => {
    const avatarId = item.username
      ? getParticipantCharacterId(item.username, item.userId, item.avatarId)
      : undefined;

    // Check type or text to select node style
    if (item.type === 'playback' || item.text.includes('started the video') || item.text.includes('played')) {
      return (
        <div className="activity-node node-play" title="Playback Event">
          <Play size={11} fill="currentColor" />
        </div>
      );
    }

    if (item.type === 'playlist' || item.text.includes('playlist')) {
      return (
        <div className="activity-node node-add" title="Playlist Event">
          <Plus size={13} strokeWidth={2.8} />
        </div>
      );
    }

    if (item.type === 'request_approved' || item.text.includes('approved')) {
      return (
        <div className="activity-node node-check" title="Request Approved">
          <Check size={12} strokeWidth={3} />
        </div>
      );
    }

    // Avatar nodes for users joining or requesting
    if (item.username) {
      return (
        <div className="activity-node node-avatar" title={item.username}>
          <AnimeAvatarDisplay
            username={item.username}
            avatarId={avatarId}
            size={24}
          />
        </div>
      );
    }

    // Fallback node
    return <div className="activity-node node-default" />;
  };

  return (
    <div className="glass-panel sidebar-card activity-timeline-panel">
      {/* Header with Title and Filter Dropdown */}
      <div className="activity-header">
        <div className="activity-header-left">
          {/* Stylized Activity mark inspired by sample photo */}
          <svg
            className="activity-mark-icon"
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M12 2L2 19h20L12 2z" />
            <line x1="7" y1="14" x2="17" y2="14" />
          </svg>
          <span className="activity-title">Activity</span>
        </div>

        {/* Filter dropdown matching sample photo ("All ˅") */}
        <div className="activity-filter-wrap">
          <button
            type="button"
            className="activity-filter-btn"
            onClick={() => setIsFilterOpen(!isFilterOpen)}
          >
            <span>{filter}</span>
            <ChevronDown size={14} className={`activity-chevron ${isFilterOpen ? 'rotated' : ''}`} />
          </button>

          {isFilterOpen && (
            <div className="activity-filter-dropdown">
              {(['All', 'Playback', 'Playlist', 'Requests', 'Joins'] as ActivityFilter[]).map(
                (f) => (
                  <button
                    key={f}
                    type="button"
                    className={`activity-filter-option ${filter === f ? 'selected' : ''}`}
                    onClick={() => {
                      setFilter(f);
                      setIsFilterOpen(false);
                    }}
                  >
                    {f}
                  </button>
                )
              )}
            </div>
          )}
        </div>
      </div>

      {/* Connected Vertical Timeline */}
      <div className="activity-timeline-container">
        {filteredActivities.length === 0 ? (
          <div className="activity-empty-state">
            <Sparkles size={24} opacity={0.3} />
            <p>No activity recorded yet</p>
          </div>
        ) : (
          <div className="activity-timeline-list">
            {/* The continuous vertical connector line */}
            <div className="activity-timeline-track-line" />

            {filteredActivities.map((item) => (
              <div key={item.id} className="activity-timeline-item">
                <div className="activity-node-col">
                  {renderTimelineNode(item)}
                </div>

                <div className="activity-content-col">
                  <span className="activity-text">{item.text}</span>
                </div>

                <div className="activity-time-col">
                  <span className="activity-timestamp">{item.time}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
