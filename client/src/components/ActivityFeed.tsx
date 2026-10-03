import React from 'react';
import { Activity, Bell } from 'lucide-react';
import { ActivityItem } from '../types.js';

interface ActivityFeedProps {
  activities: ActivityItem[];
}

export const ActivityFeed: React.FC<ActivityFeedProps> = ({ activities }) => {
  return (
    <div className="glass-panel sidebar-card">
      <div className="sidebar-title">
        <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Activity size={18} />
          Room Activity
        </span>
      </div>

      <div className="activity-feed">
        {activities.length === 0 ? (
          <div style={{ color: 'var(--text-dim)', textAlign: 'center', padding: '1rem 0' }}>
            No activity yet.
          </div>
        ) : (
          activities.map((item) => (
            <div key={item.id} className="activity-row">
              <span className="activity-time">{item.time}</span>
              <span>{item.text}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
