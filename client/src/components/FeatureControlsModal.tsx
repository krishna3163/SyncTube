import React from 'react';
import {
  X,
  SlidersHorizontal,
  Check,
  RotateCcw,
  Sparkles,
  Film,
  MessageSquare,
  ShieldCheck,
  Eye,
  Tv,
  PhoneCall,
  Volume2,
  ListMusic,
  Monitor,
  Activity,
  Layers,
  Zap,
  LucideIcon,
} from 'lucide-react';
import {
  useFeatureFlags,
  FEATURE_METADATA,
  FeatureFlagKey,
  RoomFeatureFlags,
  DEFAULT_FEATURE_FLAGS,
} from '../utils/featureFlags.js';

interface FeatureControlsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const CATEGORY_INFO: Record<
  string,
  { title: string; icon: LucideIcon }
> = {
  visual: { title: 'Visuals & Cinema Experience', icon: Eye },
  communication: { title: 'Social & Communication', icon: MessageSquare },
  media: { title: 'Media, Streams & Queue', icon: Film },
  system: { title: 'Controls, Automation & Telemetry', icon: Layers },
};

const FEATURE_ICONS: Record<FeatureFlagKey, LucideIcon> = {
  ambientGlow: Sparkles,
  floatingReactions: Sparkles,
  theaterMode: Film,
  voiceVideoCall: PhoneCall,
  chat: MessageSquare,
  soundEffects: Volume2,
  playlist: ListMusic,
  screenShare: Monitor,
  browserHub: Tv,
  actionRequests: ShieldCheck,
  activityFeed: Activity,
  syncDiagnostics: Activity,
  autoResync: Zap,
};

export const FeatureControlsModal: React.FC<FeatureControlsModalProps> = ({
  isOpen,
  onClose,
}) => {
  const [flags, updateFlag, updateBatch, resetAll] = useFeatureFlags();

  if (!isOpen) return null;

  const handleApplyMinimal = () => {
    updateBatch({
      ambientGlow: false,
      floatingReactions: false,
      soundEffects: false,
      voiceVideoCall: false,
      chat: false,
      playlist: false,
      actionRequests: false,
      activityFeed: false,
      browserHub: false,
      syncDiagnostics: false,
      theaterMode: false,
      autoResync: true,
    });
  };

  const handleApplyFullParty = () => {
    updateBatch({
      ambientGlow: true,
      floatingReactions: true,
      soundEffects: true,
      voiceVideoCall: true,
      screenShare: true,
      chat: true,
      playlist: true,
      actionRequests: true,
      activityFeed: true,
      browserHub: true,
      syncDiagnostics: true,
      theaterMode: false,
      autoResync: true,
    });
  };

  const categories = ['visual', 'communication', 'media', 'system'] as const;

  return (
    <div className="modal-backdrop" onClick={onClose} role="dialog" aria-modal="true">
      <div
        className="modal-card feature-controls-modal"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: '640px', width: '92%' }}
      >
        {/* Header */}
        <div className="modal-header">
          <div className="modal-title-row">
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: 8,
                background: 'rgba(56, 189, 248, 0.15)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#38bdf8',
              }}
            >
              <SlidersHorizontal size={18} />
            </div>
            <div>
              <h2 className="modal-title" style={{ fontSize: '1.15rem', margin: 0 }}>
                Feature Controls & Switches
              </h2>
              <p
                style={{
                  fontSize: '0.8rem',
                  color: 'var(--text-secondary, #94a3b8)',
                  margin: '2px 0 0 0',
                }}
              >
                Turn any feature ON or OFF like a button. Core playback is always guaranteed.
              </p>
            </div>
          </div>
          <button
            type="button"
            className="btn-icon modal-close-btn"
            onClick={onClose}
            aria-label="Close feature controls"
          >
            <X size={18} />
          </button>
        </div>

        {/* Quick Presets Bar */}
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '8px',
            padding: '12px 16px',
            background: 'rgba(255, 255, 255, 0.03)',
            borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
          }}
        >
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={handleApplyMinimal}
            title="Turn off sidebars and overlays for zero-distraction synchronized video"
          >
            <Film size={13} color="#38bdf8" />
            <span>Pure Video Only (Minimal)</span>
          </button>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={handleApplyFullParty}
            title="Turn on all interactive watch party features"
          >
            <Sparkles size={13} color="#fbbf24" />
            <span>Full Party Experience</span>
          </button>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={resetAll}
            title="Reset switches to default recommendations"
            style={{ marginLeft: 'auto' }}
          >
            <RotateCcw size={13} />
            <span>Reset</span>
          </button>
        </div>

        {/* Modal Body / Switch List */}
        <div
          className="modal-body"
          style={{
            maxHeight: '62vh',
            overflowY: 'auto',
            padding: '16px',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
          }}
        >
          {categories.map((catKey) => {
            const cat = CATEGORY_INFO[catKey];
            const CatIcon = cat.icon;
            const items = Object.values(FEATURE_METADATA).filter((m) => m.category === catKey);

            return (
              <div
                key={catKey}
                style={{
                  background: 'rgba(15, 23, 42, 0.45)',
                  border: '1px solid rgba(255, 255, 255, 0.07)',
                  borderRadius: '12px',
                  padding: '12px 14px',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    marginBottom: '10px',
                    paddingBottom: '8px',
                    borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
                  }}
                >
                  <CatIcon size={15} className="text-secondary" />
                  <span
                    style={{
                      fontSize: '0.82rem',
                      fontWeight: 600,
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                      color: 'var(--text-secondary, #94a3b8)',
                    }}
                  >
                    {cat.title}
                  </span>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {items.map((meta) => {
                    const isEnabled = flags[meta.key];
                    const Icon = FEATURE_ICONS[meta.key] || Zap;

                    return (
                      <div
                        key={meta.key}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '8px 10px',
                          borderRadius: '8px',
                          background: isEnabled
                            ? 'rgba(255, 255, 255, 0.03)'
                            : 'rgba(0, 0, 0, 0.2)',
                          transition: 'background 0.15s ease',
                        }}
                      >
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '10px',
                            minWidth: 0,
                            paddingRight: '12px',
                          }}
                        >
                          <div
                            style={{
                              width: 28,
                              height: 28,
                              borderRadius: 6,
                              background: isEnabled
                                ? 'rgba(16, 185, 129, 0.15)'
                                : 'rgba(255, 255, 255, 0.05)',
                              color: isEnabled ? '#10b981' : '#64748b',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              flexShrink: 0,
                            }}
                          >
                            <Icon size={14} />
                          </div>
                          <div>
                            <div
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px',
                              }}
                            >
                              <span
                                style={{
                                  fontSize: '0.88rem',
                                  fontWeight: 500,
                                  color: isEnabled ? '#f8fafc' : '#94a3b8',
                                }}
                              >
                                {meta.label}
                              </span>
                              <span
                                style={{
                                  fontSize: '0.65rem',
                                  fontWeight: 600,
                                  textTransform: 'uppercase',
                                  padding: '1px 6px',
                                  borderRadius: '999px',
                                  background: isEnabled
                                    ? 'rgba(16, 185, 129, 0.15)'
                                    : 'rgba(100, 116, 139, 0.15)',
                                  color: isEnabled ? '#34d399' : '#64748b',
                                }}
                              >
                                {isEnabled ? 'Active' : 'Off'}
                              </span>
                            </div>
                            <p
                              style={{
                                fontSize: '0.75rem',
                                color: 'var(--text-secondary, #94a3b8)',
                                margin: '2px 0 0 0',
                                lineHeight: 1.3,
                              }}
                            >
                              {meta.description}
                            </p>
                          </div>
                        </div>

                        {/* Interactive Button-style Toggle Switch */}
                        <button
                          type="button"
                          role="switch"
                          aria-checked={isEnabled}
                          aria-label={`Toggle ${meta.label}`}
                          className={`toggle-switch ${isEnabled ? 'checked' : ''}`}
                          onClick={() => updateFlag(meta.key, !isEnabled)}
                          style={{ cursor: 'pointer' }}
                        >
                          <span className="toggle-switch-slider" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer Guarantee */}
        <div
          style={{
            padding: '12px 16px',
            borderTop: '1px solid rgba(255, 255, 255, 0.07)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'rgba(15, 23, 42, 0.6)',
            borderRadius: '0 0 16px 16px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <ShieldCheck size={16} color="#10b981" />
            <span
              style={{
                fontSize: '0.78rem',
                color: '#94a3b8',
              }}
            >
              <strong>Safe Mode Guarantee:</strong> Core video sync is never interrupted by toggling features.
            </span>
          </div>

          <button type="button" className="btn btn-primary btn-sm" onClick={onClose}>
            <Check size={14} /> Done
          </button>
        </div>
      </div>
    </div>
  );
};
