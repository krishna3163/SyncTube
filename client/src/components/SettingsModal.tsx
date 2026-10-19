import React, { useEffect, useState } from 'react';
import {
  X,
  User,
  Sliders,
  Trash2,
  Check,
  Sparkles,
  Shield,
  Palette,
  ListMusic,
  MessageSquare,
  Layers,
  AlertTriangle,
  Lock,
  SlidersHorizontal,
  RotateCcw,
  ShieldCheck,
  Film,
  PhoneCall,
  Volume2,
  VolumeX,
  Radio,
  Play,
  Monitor,
  Activity,
  Zap,
} from 'lucide-react';
import { Socket } from 'socket.io-client';
import { UserSettings, RoomSettingsData, Role } from '../types.js';
import { AvatarPicker } from './AnimeAvatar.js';
import {
  useFeatureFlags,
  FEATURE_METADATA,
  FeatureFlagKey,
} from '../utils/featureFlags.js';
import {
  SOUNDBOARD_SOUNDS,
  SoundboardEffectId,
  playSoundboardEffect,
  canPlaySoundboard,
  getSoundPreferences,
  setSoundPreferences,
  SoundPreferences,
} from '../utils/soundEffects.js';
import { firePartyConfetti } from '../utils/confetti.js';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUserRole: Role;
  userSettings: UserSettings;
  onUpdateUserSettings: (settings: UserSettings) => void;
  roomSettings: RoomSettingsData;
  onUpdateRoomSettings: (settings: RoomSettingsData) => void;
  onDeleteRoom: () => void;
  ambientMode?: boolean;
  onToggleAmbientMode?: () => void;
  ambientBlur?: number;
  ambientSpread?: number;
  onAmbientBlurChange?: (value: number) => void;
  onAmbientSpreadChange?: (value: number) => void;
  initialTab?: 'room' | 'user' | 'features' | 'audio';
  socket?: Socket | null;
  onNotify?: (msg: string, type: 'success' | 'error' | 'info') => void;
}

const PRESET_USER_COLORS = [
  '#3F8A1D',
  '#FF00FF',
  '#00FFFF',
  '#6366F1',
  '#8B5CF6',
  '#EC4899',
  '#10B981',
  '#F59E0B',
  '#E11D48',
  '#14B8A6',
];

const PRESET_ROOM_COLORS = [
  '#3F8A1D',
  '#FF00FF',
  '#00FFFF',
  '#6366F1',
  '#8B5CF6',
  '#EC4899',
  '#10B981',
  '#F59E0B',
  '#E11D48',
  '#14B8A6',
];

const ROOM_THEMES: Array<{
  value: RoomSettingsData['theme'];
  label: string;
  description: string;
  gradient: string;
}> = [
  {
    value: 'midnight',
    label: 'Midnight',
    description: 'Deep obsidian theater with ultra-low reflection',
    gradient: 'linear-gradient(135deg, #090B0D 0%, #16181D 100%)',
  },
  {
    value: 'ocean',
    label: 'Ocean',
    description: 'Deep navy cinematic atmosphere with cool highlights',
    gradient: 'linear-gradient(135deg, #071524 0%, #0D2D49 100%)',
  },
  {
    value: 'forest',
    label: 'Forest',
    description: 'Rich emerald & midnight pine ambient palette',
    gradient: 'linear-gradient(135deg, #091C12 0%, #113421 100%)',
  },
  {
    value: 'sunset',
    label: 'Sunset',
    description: 'Warm dusk twilight with velvety shadows',
    gradient: 'linear-gradient(135deg, #230F17 0%, #3C161D 100%)',
  },
];

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  currentUserRole,
  userSettings,
  onUpdateUserSettings,
  roomSettings,
  onUpdateRoomSettings,
  onDeleteRoom,
  ambientMode = true,
  onToggleAmbientMode,
  ambientBlur = 30,
  ambientSpread = 100,
  onAmbientBlurChange,
  onAmbientSpreadChange,
  initialTab = 'room',
  socket,
  onNotify,
}) => {
  const [activeTab, setActiveTab] = useState<'room' | 'user' | 'features' | 'audio'>(initialTab);
  const [flags, updateFlag, updateBatch, resetAllFlags] = useFeatureFlags();
  const [localUser, setLocalUser] = useState<UserSettings>(userSettings);
  const [localRoom, setLocalRoom] = useState<RoomSettingsData>(roomSettings);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Audio & Soundboard State
  const [soundPrefs, setSoundPrefs] = useState<SoundPreferences>(getSoundPreferences);
  const [soundCooldownRemaining, setSoundCooldownRemaining] = useState<number>(0);
  const [activeSoundPlaying, setActiveSoundPlaying] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    if (initialTab) {
      setActiveTab(initialTab);
    }
    setLocalUser(userSettings);
    setLocalRoom(roomSettings);
    setDeleteConfirm(false);
    setSaveSuccess(false);
    setSoundPrefs(getSoundPreferences());
  }, [isOpen, initialTab, userSettings, roomSettings]);

  // Sound cooldown countdown timer
  useEffect(() => {
    if (soundCooldownRemaining <= 0) return;
    const interval = setInterval(() => {
      setSoundCooldownRemaining((prev) => Math.max(0, prev - 100));
    }, 100);
    return () => clearInterval(interval);
  }, [soundCooldownRemaining]);

  const handleToggleAudioMute = () => {
    const updated = setSoundPreferences((prev) => ({
      ...prev,
      masterMute: !prev.masterMute,
    }));
    setSoundPrefs(updated);
  };

  const handleAudioVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    const updated = setSoundPreferences((prev) => ({
      ...prev,
      masterVolume: val,
    }));
    setSoundPrefs(updated);
  };

  const handleToggleAudioEvent = (key: keyof SoundPreferences['events']) => {
    const updated = setSoundPreferences((prev) => ({
      ...prev,
      events: {
        ...prev.events,
        [key]: !prev.events[key],
      },
    }));
    setSoundPrefs(updated);
  };

  const handleLocalPlaySound = (soundId: SoundboardEffectId) => {
    setActiveSoundPlaying(soundId);
    playSoundboardEffect(soundId);
    if (soundId === 'cheer') {
      firePartyConfetti({ particleCount: 35 });
    }
    setTimeout(() => setActiveSoundPlaying(null), 600);
  };

  const handleBroadcastSound = (soundId: SoundboardEffectId) => {
    if (!canPlaySoundboard()) {
      onNotify?.('Please wait a moment before sending another party sound.', 'info');
      return;
    }
    handleLocalPlaySound(soundId);
    if (socket && socket.connected) {
      socket.emit('send_sound_effect', { soundId });
      setSoundCooldownRemaining(soundPrefs.soundboardCooldownMs);
      onNotify?.(`Broadcasted ${soundId} sound to party!`, 'success');
    }
  };

  const handleResetAudioToDefault = () => {
    const def = setSoundPreferences(() => ({
      masterMute: false,
      masterVolume: 0.7,
      events: {
        roomJoin: true,
        roomLeave: true,
        chatReceive: true,
        chatSend: true,
        reaction: true,
        linkCopy: true,
        soundboard: true,
      },
      soundboardCooldownMs: 1200,
    }));
    setSoundPrefs(def);
    onNotify?.('Audio settings reset to defaults', 'info');
  };

  // Handle Escape key to close modal
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const isOwner = currentUserRole === 'HOST';

  const handleSaveUser = (e: React.FormEvent) => {
    e.preventDefault();
    onUpdateUserSettings(localUser);
    setSaveSuccess(true);
    setTimeout(() => {
      onClose();
    }, 250);
  };

  const handleTogglePermission = (
    key: keyof RoomSettingsData['permissions'],
    group: 'viewer' | 'moderator' | 'owner'
  ) => {
    if (!isOwner) return;
    setLocalRoom((prev) => ({
      ...prev,
      permissions: {
        ...prev.permissions,
        [key]: {
          ...prev.permissions[key],
          [group]: !prev.permissions[key][group],
        },
      },
    }));
  };

  const handleSaveRoom = (e: React.FormEvent) => {
    e.preventDefault();
    onUpdateRoomSettings(localRoom);
    setSaveSuccess(true);
    setTimeout(() => {
      onClose();
    }, 250);
  };

  const permissionRows: {
    key: keyof RoomSettingsData['permissions'];
    label: string;
    description: string;
  }[] = [
    { key: 'add', label: 'Add to queue', description: 'Search and queue new videos or streams' },
    { key: 'remove', label: 'Remove video', description: 'Remove media entries from the playlist' },
    { key: 'move', label: 'Reorder playlist', description: 'Drag or rearrange playlist sequencing' },
    { key: 'playPause', label: 'Play / Pause', description: 'Control synchronous playback state' },
    { key: 'seek', label: 'Seek playback', description: 'Scrub time bar and leap to timestamps' },
    { key: 'skip', label: 'Skip to next', description: 'Advance current stream to subsequent item' },
    { key: 'chatSend', label: 'Send messages', description: 'Transmit text messages & live reactions' },
    { key: 'chatDelete', label: 'Delete chat', description: 'Prune chat comments from discussion feed' },
    { key: 'ban', label: 'Kick & ban', description: 'Eject unruly participants from this watch room' },
  ];

  return (
    <div
      className="modal-backdrop cinejoy-settings-backdrop"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="modal-card cinejoy-settings-card"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-dialog-title"
      >
        {/* Header Region */}
        <header className="cinejoy-settings-header">
          <div className="cinejoy-settings-brand-row">
            <div className="cinejoy-settings-title-group">
              <span className="cinejoy-settings-badge">SyncTube Central Settings</span>
              <h1 id="settings-dialog-title" className="cinejoy-settings-title">
                {activeTab === 'room'
                  ? 'Room Settings'
                  : activeTab === 'user'
                  ? 'User & Profile Settings'
                  : activeTab === 'audio'
                  ? 'Party Soundboard & Audio FX'
                  : 'Feature Switches & Controls'}
              </h1>
            </div>

            <button
              type="button"
              className="cinejoy-btn-icon cinejoy-close-btn"
              onClick={onClose}
              aria-label="Close settings dialog"
              title="Close (Esc)"
            >
              <X size={16} strokeWidth={2} />
            </button>
          </div>

          {/* Segmented Tab Navigation Bar */}
          <nav className="cinejoy-tabs-nav" aria-label="Settings categories">
            <button
              type="button"
              id="tab-room-settings"
              role="tab"
              aria-selected={activeTab === 'room'}
              aria-controls="panel-room-settings"
              className={`cinejoy-tab-btn ${activeTab === 'room' ? 'active' : ''}`}
              onClick={() => {
                setActiveTab('room');
                setDeleteConfirm(false);
              }}
            >
              <Sliders size={16} strokeWidth={2} />
              <span>Room</span>
            </button>

            <button
              type="button"
              id="tab-user-settings"
              role="tab"
              aria-selected={activeTab === 'user'}
              aria-controls="panel-user-settings"
              className={`cinejoy-tab-btn ${activeTab === 'user' ? 'active' : ''}`}
              onClick={() => {
                setActiveTab('user');
                setDeleteConfirm(false);
              }}
            >
              <User size={16} strokeWidth={2} />
              <span>Profile</span>
            </button>

            <button
              type="button"
              id="tab-audio-settings"
              role="tab"
              aria-selected={activeTab === 'audio'}
              aria-controls="panel-audio-settings"
              className={`cinejoy-tab-btn ${activeTab === 'audio' ? 'active' : ''}`}
              onClick={() => {
                setActiveTab('audio');
                setDeleteConfirm(false);
              }}
            >
              <Volume2 size={16} strokeWidth={2} />
              <span>Soundboard & FX</span>
            </button>

            <button
              type="button"
              id="tab-features-settings"
              role="tab"
              aria-selected={activeTab === 'features'}
              aria-controls="panel-features-settings"
              className={`cinejoy-tab-btn ${activeTab === 'features' ? 'active' : ''}`}
              onClick={() => {
                setActiveTab('features');
                setDeleteConfirm(false);
              }}
            >
              <SlidersHorizontal size={16} strokeWidth={2} />
              <span>Feature Switches</span>
            </button>
          </nav>
        </header>

        {/* Modal Scrollable Body */}
        <main className="cinejoy-settings-body">
          {activeTab === 'features' ? (
            <div
              id="panel-features-settings"
              role="tabpanel"
              aria-labelledby="tab-features-settings"
              className="cinejoy-settings-stack"
            >
              {/* Presets Header */}
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center', marginBottom: '8px' }}>
                <button
                  type="button"
                  className="cinejoy-btn cinejoy-btn-secondary"
                  onClick={() =>
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
                    })
                  }
                >
                  <Film size={14} />
                  <span>Minimal (Video Only)</span>
                </button>
                <button
                  type="button"
                  className="cinejoy-btn cinejoy-btn-secondary"
                  onClick={() =>
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
                    })
                  }
                >
                  <Sparkles size={14} />
                  <span>Full Party Experience</span>
                </button>
                <button
                  type="button"
                  className="cinejoy-btn cinejoy-btn-secondary"
                  style={{ marginLeft: 'auto' }}
                  onClick={resetAllFlags}
                >
                  <RotateCcw size={14} />
                  <span>Reset Defaults</span>
                </button>
              </div>

              {/* Group 1: Visuals & Cinema */}
              <section className="cinejoy-framed-card">
                <div className="cinejoy-card-header">
                  <div className="cinejoy-card-title-row">
                    <div className="cinejoy-icon-pill">
                      <Sparkles size={16} strokeWidth={2} />
                    </div>
                    <div className="cinejoy-card-title-text">
                      <h2 className="cinejoy-heading">Visuals & Cinema Experience</h2>
                      <p className="cinejoy-subtext">Toggle ambient glow, flying reactions, and theater dimming.</p>
                    </div>
                  </div>
                </div>
                <div className="cinejoy-card-content">
                  <div className="cinejoy-toggles-stack">
                    {(['ambientGlow', 'floatingReactions', 'theaterMode'] as FeatureFlagKey[]).map((key) => {
                      const meta = FEATURE_METADATA[key];
                      return (
                        <label key={key} className="cinejoy-toggle-row">
                          <div className="cinejoy-toggle-text">
                            <span className="cinejoy-toggle-title">{meta.label}</span>
                            <span className="cinejoy-toggle-desc">{meta.description}</span>
                          </div>
                          <div className="cinejoy-switch">
                            <input
                              type="checkbox"
                              checked={flags[key]}
                              onChange={(e) => updateFlag(key, e.target.checked)}
                              aria-label={`Toggle ${meta.label}`}
                            />
                            <span className="cinejoy-slider" />
                          </div>
                        </label>
                      );
                    })}
                  </div>
                </div>
              </section>

              {/* Group 2: Social & Communication */}
              <section className="cinejoy-framed-card">
                <div className="cinejoy-card-header">
                  <div className="cinejoy-card-title-row">
                    <div className="cinejoy-icon-pill">
                      <MessageSquare size={16} strokeWidth={2} />
                    </div>
                    <div className="cinejoy-card-title-text">
                      <h2 className="cinejoy-heading">Social & Communication</h2>
                      <p className="cinejoy-subtext">Toggle Zoom/Meet call stage, live chat, and audio chimes.</p>
                    </div>
                  </div>
                </div>
                <div className="cinejoy-card-content">
                  <div className="cinejoy-toggles-stack">
                    {(['voiceVideoCall', 'chat', 'soundEffects'] as FeatureFlagKey[]).map((key) => {
                      const meta = FEATURE_METADATA[key];
                      return (
                        <label key={key} className="cinejoy-toggle-row">
                          <div className="cinejoy-toggle-text">
                            <span className="cinejoy-toggle-title">{meta.label}</span>
                            <span className="cinejoy-toggle-desc">{meta.description}</span>
                          </div>
                          <div className="cinejoy-switch">
                            <input
                              type="checkbox"
                              checked={flags[key]}
                              onChange={(e) => updateFlag(key, e.target.checked)}
                              aria-label={`Toggle ${meta.label}`}
                            />
                            <span className="cinejoy-slider" />
                          </div>
                        </label>
                      );
                    })}
                  </div>
                </div>
              </section>

              {/* Group 3: Media & Streams */}
              <section className="cinejoy-framed-card">
                <div className="cinejoy-card-header">
                  <div className="cinejoy-card-title-row">
                    <div className="cinejoy-icon-pill">
                      <Film size={16} strokeWidth={2} />
                    </div>
                    <div className="cinejoy-card-title-text">
                      <h2 className="cinejoy-heading">Media, Streams & Queue</h2>
                      <p className="cinejoy-subtext">Toggle playlist queue, screen sharing, and media hub launcher.</p>
                    </div>
                  </div>
                </div>
                <div className="cinejoy-card-content">
                  <div className="cinejoy-toggles-stack">
                    {(['playlist', 'screenShare', 'browserHub'] as FeatureFlagKey[]).map((key) => {
                      const meta = FEATURE_METADATA[key];
                      return (
                        <label key={key} className="cinejoy-toggle-row">
                          <div className="cinejoy-toggle-text">
                            <span className="cinejoy-toggle-title">{meta.label}</span>
                            <span className="cinejoy-toggle-desc">{meta.description}</span>
                          </div>
                          <div className="cinejoy-switch">
                            <input
                              type="checkbox"
                              checked={flags[key]}
                              onChange={(e) => updateFlag(key, e.target.checked)}
                              aria-label={`Toggle ${meta.label}`}
                            />
                            <span className="cinejoy-slider" />
                          </div>
                        </label>
                      );
                    })}
                  </div>
                </div>
              </section>

              {/* Group 4: Controls & Telemetry */}
              <section className="cinejoy-framed-card">
                <div className="cinejoy-card-header">
                  <div className="cinejoy-card-title-row">
                    <div className="cinejoy-icon-pill">
                      <ShieldCheck size={16} strokeWidth={2} />
                    </div>
                    <div className="cinejoy-card-title-text">
                      <h2 className="cinejoy-heading">Controls & Automation</h2>
                      <p className="cinejoy-subtext">Toggle action requests, activity log, telemetry, and auto drift correction.</p>
                    </div>
                  </div>
                </div>
                <div className="cinejoy-card-content">
                  <div className="cinejoy-toggles-stack">
                    {(['actionRequests', 'activityFeed', 'syncDiagnostics', 'autoResync'] as FeatureFlagKey[]).map((key) => {
                      const meta = FEATURE_METADATA[key];
                      return (
                        <label key={key} className="cinejoy-toggle-row">
                          <div className="cinejoy-toggle-text">
                            <span className="cinejoy-toggle-title">{meta.label}</span>
                            <span className="cinejoy-toggle-desc">{meta.description}</span>
                          </div>
                          <div className="cinejoy-switch">
                            <input
                              type="checkbox"
                              checked={flags[key]}
                              onChange={(e) => updateFlag(key, e.target.checked)}
                              aria-label={`Toggle ${meta.label}`}
                            />
                            <span className="cinejoy-slider" />
                          </div>
                        </label>
                      );
                    })}
                  </div>
                </div>
              </section>

              {/* Safe Mode Guarantee */}
              <section className="cinejoy-framed-card cinejoy-info-card">
                <div className="cinejoy-card-header">
                  <div className="cinejoy-card-title-row">
                    <div className="cinejoy-icon-pill cinejoy-icon-pill-accent">
                      <ShieldCheck size={16} strokeWidth={2} />
                    </div>
                    <div className="cinejoy-card-title-text">
                      <h2 className="cinejoy-heading">Safe Mode Guarantee</h2>
                      <p className="cinejoy-subtext">
                        Turning features on or off will never interrupt video playback, synchronization, or room connection.
                      </p>
                    </div>
                  </div>
                </div>
              </section>

              {/* Modal Actions Footer */}
              <footer className="cinejoy-modal-footer">
                <button
                  type="button"
                  className="cinejoy-btn cinejoy-btn-primary"
                  onClick={onClose}
                >
                  <Check size={16} strokeWidth={2} />
                  <span>Done</span>
                </button>
              </footer>
            </div>
          ) : activeTab === 'room' ? (
            <form
              id="panel-room-settings"
              role="tabpanel"
              aria-labelledby="tab-room-settings"
              onSubmit={handleSaveRoom}
              className="cinejoy-settings-stack"
            >
              {/* Section 1: Room Identification */}
              <section className="cinejoy-framed-card">
                <div className="cinejoy-card-header">
                  <div className="cinejoy-card-title-row">
                    <div className="cinejoy-icon-pill">
                      <Sliders size={16} strokeWidth={2} />
                    </div>
                    <div className="cinejoy-card-title-text">
                      <h2 className="cinejoy-heading">Room Identity</h2>
                      <p className="cinejoy-subtext">
                        Configure public room name and host privilege settings.
                      </p>
                    </div>
                  </div>
                  <div className="cinejoy-role-pill">
                    {isOwner ? (
                      <span className="cinejoy-tag cinejoy-tag-host">Host Admin</span>
                    ) : (
                      <span className="cinejoy-tag cinejoy-tag-viewer">
                        <Lock size={12} strokeWidth={2} /> Read-Only
                      </span>
                    )}
                  </div>
                </div>

                <div className="cinejoy-card-content">
                  <div className="cinejoy-form-group">
                    <label className="cinejoy-label" htmlFor="room-name-field">
                      Room Name
                    </label>
                    <input
                      id="room-name-field"
                      type="text"
                      className="cinejoy-input"
                      value={localRoom.name}
                      disabled={!isOwner}
                      onChange={(e) => setLocalRoom({ ...localRoom, name: e.target.value })}
                      placeholder="e.g. CineJoy Premiere Room"
                      maxLength={50}
                      required
                    />
                    <span className="cinejoy-hint">
                      {isOwner
                        ? 'Name is broadcasted to all viewers upon entering.'
                        : 'Only the room host can update room details.'}
                    </span>
                  </div>
                </div>
              </section>

              {/* Section 2: Appearance & Atmosphere */}
              <section className="cinejoy-framed-card">
                <div className="cinejoy-card-header">
                  <div className="cinejoy-card-title-row">
                    <div className="cinejoy-icon-pill">
                      <Palette size={16} strokeWidth={2} />
                    </div>
                    <div className="cinejoy-card-title-text">
                      <h2 className="cinejoy-heading">Room Atmosphere</h2>
                      <p className="cinejoy-subtext">
                        Shared visual theme and accent color for all participants in this room.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="cinejoy-card-content">
                  {/* Theme grid */}
                  <div className="cinejoy-theme-grid" role="radiogroup" aria-label="Room theme">
                    {ROOM_THEMES.map((theme) => {
                      const isSelected = localRoom.theme === theme.value;
                      return (
                        <button
                          key={theme.value}
                          type="button"
                          role="radio"
                          aria-checked={isSelected}
                          className={`cinejoy-theme-card ${isSelected ? 'selected' : ''}`}
                          disabled={!isOwner}
                          onClick={() => setLocalRoom({ ...localRoom, theme: theme.value })}
                        >
                          <div
                            className="cinejoy-theme-swatch"
                            style={{ background: theme.gradient }}
                          >
                            {isSelected && (
                              <div className="cinejoy-theme-check">
                                <Check size={14} strokeWidth={2.5} />
                              </div>
                            )}
                          </div>
                          <div className="cinejoy-theme-info">
                            <span className="cinejoy-theme-label">{theme.label}</span>
                            <span className="cinejoy-theme-desc">{theme.description}</span>
                          </div>
                        </button>
                      );
                    })}
                  </div>

                  {/* Accent color picker */}
                  <div className="cinejoy-form-group cinejoy-color-section">
                    <label className="cinejoy-label">Room Accent Color</label>
                    <div className="cinejoy-color-row">
                      <input
                        type="color"
                        className="cinejoy-color-picker"
                        value={localRoom.accentColor || '#3F8A1D'}
                        disabled={!isOwner}
                        onChange={(e) =>
                          setLocalRoom({ ...localRoom, accentColor: e.target.value })
                        }
                        aria-label="Pick custom room accent color"
                      />
                      <input
                        type="text"
                        className="cinejoy-input cinejoy-hex-input"
                        value={localRoom.accentColor || '#3F8A1D'}
                        disabled={!isOwner}
                        pattern="^#[0-9a-fA-F]{6}$"
                        onChange={(e) =>
                          setLocalRoom({ ...localRoom, accentColor: e.target.value })
                        }
                        aria-label="Hex color string"
                      />
                      <div className="cinejoy-swatches-row">
                        {PRESET_ROOM_COLORS.map((c) => (
                          <button
                            key={c}
                            type="button"
                            className={`cinejoy-swatch-dot ${
                              localRoom.accentColor === c ? 'selected' : ''
                            }`}
                            style={{ backgroundColor: c }}
                            disabled={!isOwner}
                            onClick={() => setLocalRoom({ ...localRoom, accentColor: c })}
                            title={c}
                            aria-label={`Select accent ${c}`}
                          />
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </section>

              {/* Section 3: Permissions Matrix */}
              <section className="cinejoy-framed-card">
                <div className="cinejoy-card-header">
                  <div className="cinejoy-card-title-row">
                    <div className="cinejoy-icon-pill">
                      <Shield size={16} strokeWidth={2} />
                    </div>
                    <div className="cinejoy-card-title-text">
                      <h2 className="cinejoy-heading">Role Permissions Matrix</h2>
                      <p className="cinejoy-subtext">
                        Enforce granular capability access across Viewer, Moderator, and Owner tiers.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="cinejoy-card-content">
                  <div className="cinejoy-table-container">
                    <table className="cinejoy-perm-table">
                      <thead>
                        <tr>
                          <th scope="col" className="cinejoy-perm-col-action">
                            Capability
                          </th>
                          <th scope="col" className="cinejoy-perm-col-role">
                            Viewer
                          </th>
                          <th scope="col" className="cinejoy-perm-col-role">
                            Moderator
                          </th>
                          <th scope="col" className="cinejoy-perm-col-role">
                            Owner / Host
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {permissionRows.map((row) => (
                          <tr key={row.key} className="cinejoy-perm-row">
                            <td className="cinejoy-perm-info">
                              <span className="cinejoy-perm-title">{row.label}</span>
                              <span className="cinejoy-perm-desc">{row.description}</span>
                            </td>

                            <td className="cinejoy-perm-toggle-cell">
                              <label className="cinejoy-checkbox-custom">
                                <input
                                  type="checkbox"
                                  checked={!!localRoom.permissions[row.key]?.viewer}
                                  disabled={!isOwner}
                                  onChange={() => handleTogglePermission(row.key, 'viewer')}
                                  aria-label={`Viewer permission for ${row.label}`}
                                />
                                <span className="cinejoy-checkbox-mark" />
                              </label>
                            </td>

                            <td className="cinejoy-perm-toggle-cell">
                              <label className="cinejoy-checkbox-custom">
                                <input
                                  type="checkbox"
                                  checked={!!localRoom.permissions[row.key]?.moderator}
                                  disabled={!isOwner}
                                  onChange={() => handleTogglePermission(row.key, 'moderator')}
                                  aria-label={`Moderator permission for ${row.label}`}
                                />
                                <span className="cinejoy-checkbox-mark" />
                              </label>
                            </td>

                            <td className="cinejoy-perm-toggle-cell">
                              <label className="cinejoy-checkbox-custom">
                                <input
                                  type="checkbox"
                                  checked={!!localRoom.permissions[row.key]?.owner}
                                  disabled={!isOwner}
                                  onChange={() => handleTogglePermission(row.key, 'owner')}
                                  aria-label={`Owner permission for ${row.label}`}
                                />
                                <span className="cinejoy-checkbox-mark" />
                              </label>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </section>

              {/* Section 4: Playlist Automation */}
              <section className="cinejoy-framed-card">
                <div className="cinejoy-card-header">
                  <div className="cinejoy-card-title-row">
                    <div className="cinejoy-icon-pill">
                      <ListMusic size={16} strokeWidth={2} />
                    </div>
                    <div className="cinejoy-card-title-text">
                      <h2 className="cinejoy-heading">Playlist Automation</h2>
                      <p className="cinejoy-subtext">
                        Rules governing queue advancement and playback ordering.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="cinejoy-card-content cinejoy-toggles-stack">
                  <label className="cinejoy-toggle-row">
                    <div className="cinejoy-toggle-text">
                      <span className="cinejoy-toggle-title">Auto-remove played videos</span>
                      <span className="cinejoy-toggle-desc">
                        Automatically prune videos from the room playlist when playback finishes.
                      </span>
                    </div>
                    <div className="cinejoy-switch">
                      <input
                        type="checkbox"
                        checked={localRoom.autoRemovePlayed}
                        disabled={!isOwner}
                        onChange={(e) =>
                          setLocalRoom({ ...localRoom, autoRemovePlayed: e.target.checked })
                        }
                        aria-label="Auto-remove played videos"
                      />
                      <span className="cinejoy-slider" />
                    </div>
                  </label>

                  <label className="cinejoy-toggle-row">
                    <div className="cinejoy-toggle-text">
                      <span className="cinejoy-toggle-title">Shuffle playlist mode</span>
                      <span className="cinejoy-toggle-desc">
                        Randomize upcoming queued videos instead of strictly linear playback.
                      </span>
                    </div>
                    <div className="cinejoy-switch">
                      <input
                        type="checkbox"
                        checked={localRoom.shuffle}
                        disabled={!isOwner}
                        onChange={(e) =>
                          setLocalRoom({ ...localRoom, shuffle: e.target.checked })
                        }
                        aria-label="Shuffle playlist"
                      />
                      <span className="cinejoy-slider" />
                    </div>
                  </label>
                </div>
              </section>

              {/* Section 5: Chat Security */}
              <section className="cinejoy-framed-card">
                <div className="cinejoy-card-header">
                  <div className="cinejoy-card-title-row">
                    <div className="cinejoy-icon-pill">
                      <MessageSquare size={16} strokeWidth={2} />
                    </div>
                    <div className="cinejoy-card-title-text">
                      <h2 className="cinejoy-heading">Chat & Media Sharing</h2>
                      <p className="cinejoy-subtext">
                        Enforce chat safety and control external link rendering.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="cinejoy-card-content cinejoy-toggles-stack">
                  <label className="cinejoy-toggle-row">
                    <div className="cinejoy-toggle-text">
                      <span className="cinejoy-toggle-title">Allow external links</span>
                      <span className="cinejoy-toggle-desc">
                        Permit participants to post clickable URLs in the chat timeline.
                      </span>
                    </div>
                    <div className="cinejoy-switch">
                      <input
                        type="checkbox"
                        checked={localRoom.allowLinks}
                        disabled={!isOwner}
                        onChange={(e) =>
                          setLocalRoom({ ...localRoom, allowLinks: e.target.checked })
                        }
                        aria-label="Allow external links in chat"
                      />
                      <span className="cinejoy-slider" />
                    </div>
                  </label>

                  <label className="cinejoy-toggle-row">
                    <div className="cinejoy-toggle-text">
                      <span className="cinejoy-toggle-title">Allow rich embedded previews</span>
                      <span className="cinejoy-toggle-desc">
                        Automatically fetch and display inline media preview cards for shared links.
                      </span>
                    </div>
                    <div className="cinejoy-switch">
                      <input
                        type="checkbox"
                        checked={localRoom.allowEmbeddedLinks}
                        disabled={!isOwner}
                        onChange={(e) =>
                          setLocalRoom({
                            ...localRoom,
                            allowEmbeddedLinks: e.target.checked,
                          })
                        }
                        aria-label="Allow rich embedded link previews"
                      />
                      <span className="cinejoy-slider" />
                    </div>
                  </label>
                </div>
              </section>

              {/* Section 6: Persistence Guarantee */}
              <section className="cinejoy-framed-card cinejoy-info-card">
                <div className="cinejoy-card-header">
                  <div className="cinejoy-card-title-row">
                    <div className="cinejoy-icon-pill cinejoy-icon-pill-accent">
                      <Layers size={16} strokeWidth={2} />
                    </div>
                    <div className="cinejoy-card-title-text">
                      <h2 className="cinejoy-heading">Room State Synchronization</h2>
                      <p className="cinejoy-subtext">
                        All room configurations, playlist state, and playback timestamps persist
                        seamlessly across room reconnections.
                      </p>
                    </div>
                  </div>
                </div>
              </section>

              {/* Section 7: Danger Zone */}
              {isOwner && (
                <section className="cinejoy-framed-card cinejoy-danger-card">
                  <div className="cinejoy-card-header">
                    <div className="cinejoy-card-title-row">
                      <div className="cinejoy-icon-pill cinejoy-icon-pill-danger">
                        <AlertTriangle size={16} strokeWidth={2} />
                      </div>
                      <div className="cinejoy-card-title-text">
                        <h2 className="cinejoy-heading cinejoy-text-danger">Delete Room</h2>
                        <p className="cinejoy-subtext">
                          Permanently close this watch room and immediately disconnect all viewers.
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="cinejoy-card-content">
                    {!deleteConfirm ? (
                      <button
                        type="button"
                        className="cinejoy-btn cinejoy-btn-danger"
                        onClick={() => setDeleteConfirm(true)}
                      >
                        <Trash2 size={16} strokeWidth={2} />
                        <span>Delete Room</span>
                      </button>
                    ) : (
                      <div className="cinejoy-confirm-box">
                        <p className="cinejoy-confirm-text">
                          Are you sure? This action cannot be reversed.
                        </p>
                        <div className="cinejoy-confirm-actions">
                          <button
                            type="button"
                            className="cinejoy-btn cinejoy-btn-danger"
                            onClick={onDeleteRoom}
                          >
                            <Trash2 size={16} strokeWidth={2} />
                            <span>Confirm Permanent Deletion</span>
                          </button>
                          <button
                            type="button"
                            className="cinejoy-btn cinejoy-btn-secondary"
                            onClick={() => setDeleteConfirm(false)}
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </section>
              )}

              {/* Modal Actions Footer */}
              <footer className="cinejoy-modal-footer">
                {!isOwner && (
                  <div className="cinejoy-viewer-notice">
                    <Lock size={14} strokeWidth={2} />
                    <span>View-only: Only the room host can update room settings.</span>
                  </div>
                )}
                <button
                  type="button"
                  className="cinejoy-btn cinejoy-btn-secondary"
                  onClick={onClose}
                >
                  {isOwner ? 'Cancel' : 'Close'}
                </button>
                {isOwner && (
                  <button type="submit" className="cinejoy-btn cinejoy-btn-primary">
                    <Check size={16} strokeWidth={2} />
                    <span>{saveSuccess ? 'Saved!' : 'Save Room Settings'}</span>
                  </button>
                )}
              </footer>
            </form>
          ) : activeTab === 'user' ? (
            <form
              id="panel-user-settings"
              role="tabpanel"
              aria-labelledby="tab-user-settings"
              onSubmit={handleSaveUser}
              className="cinejoy-settings-stack"
            >
              {/* User Section 1: Anime Avatar */}
              <section className="cinejoy-framed-card">
                <div className="cinejoy-card-header">
                  <div className="cinejoy-card-title-row">
                    <div className="cinejoy-icon-pill">
                      <Sparkles size={16} strokeWidth={2} />
                    </div>
                    <div className="cinejoy-card-title-text">
                      <h2 className="cinejoy-heading">Anime Avatar Identity</h2>
                      <p className="cinejoy-subtext">
                        Select an anime character as your live chat and presence avatar.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="cinejoy-card-content">
                  <AvatarPicker
                    selectedId={localUser.avatarId}
                    username={localUser.name}
                    onSelect={(id) => setLocalUser({ ...localUser, avatarId: id })}
                  />
                </div>
              </section>

              {/* User Section 2: User Name */}
              <section className="cinejoy-framed-card">
                <div className="cinejoy-card-header">
                  <div className="cinejoy-card-title-row">
                    <div className="cinejoy-icon-pill">
                      <User size={16} strokeWidth={2} />
                    </div>
                    <div className="cinejoy-card-title-text">
                      <h2 className="cinejoy-heading">Display Name</h2>
                      <p className="cinejoy-subtext">
                        Visible in the viewer roster, activity log, and chat feed.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="cinejoy-card-content">
                  <div className="cinejoy-form-group">
                    <label className="cinejoy-label" htmlFor="user-display-name">
                      Username
                    </label>
                    <input
                      id="user-display-name"
                      type="text"
                      className="cinejoy-input"
                      value={localUser.name}
                      onChange={(e) => setLocalUser({ ...localUser, name: e.target.value })}
                      placeholder="e.g. BrightStinkbug"
                      maxLength={30}
                      required
                    />
                  </div>
                </div>
              </section>

              {/* User Section 3: Color & Live Preview */}
              <section className="cinejoy-framed-card">
                <div className="cinejoy-card-header">
                  <div className="cinejoy-card-title-row">
                    <div className="cinejoy-icon-pill">
                      <Palette size={16} strokeWidth={2} />
                    </div>
                    <div className="cinejoy-card-title-text">
                      <h2 className="cinejoy-heading">Chat Accent & Preview</h2>
                      <p className="cinejoy-subtext">
                        Personalize your chat moniker and observe real-time preview styling.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="cinejoy-card-content">
                  <div className="cinejoy-form-group">
                    <label className="cinejoy-label">Moniker Color</label>
                    <div className="cinejoy-color-row">
                      <input
                        type="color"
                        className="cinejoy-color-picker"
                        value={localUser.color || '#3F8A1D'}
                        onChange={(e) => setLocalUser({ ...localUser, color: e.target.value })}
                        aria-label="Pick custom chat user color"
                      />
                      <input
                        type="text"
                        className="cinejoy-input cinejoy-hex-input"
                        value={localUser.color || '#3F8A1D'}
                        pattern="^#[0-9a-fA-F]{6}$"
                        onChange={(e) => setLocalUser({ ...localUser, color: e.target.value })}
                        aria-label="Hex color value"
                      />
                      <div className="cinejoy-swatches-row">
                        {PRESET_USER_COLORS.map((c) => (
                          <button
                            key={c}
                            type="button"
                            className={`cinejoy-swatch-dot ${
                              localUser.color === c ? 'selected' : ''
                            }`}
                            style={{ backgroundColor: c }}
                            onClick={() => setLocalUser({ ...localUser, color: c })}
                            title={c}
                            aria-label={`Select user color ${c}`}
                          />
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Live Chat Message Bubble Preview */}
                  <div className="cinejoy-preview-box">
                    <span className="cinejoy-preview-tag">Live Chat Message Preview</span>
                    <div className="cinejoy-preview-message">
                      <span
                        className="cinejoy-preview-username"
                        style={{ color: localUser.color || '#3F8A1D' }}
                      >
                        {localUser.name || 'BrightStinkbug'}:
                      </span>
                      <span className="cinejoy-preview-body">
                        Syncing playback smoothly with CineJoy watch party! 🍿
                      </span>
                    </div>
                  </div>
                </div>
              </section>

              {/* User Section 4: Ambient Lighting Controls */}
              {onToggleAmbientMode && (
                <section className="cinejoy-framed-card">
                  <div className="cinejoy-card-header">
                    <div className="cinejoy-card-title-row">
                      <div className="cinejoy-icon-pill">
                        <Sparkles size={16} strokeWidth={2} />
                      </div>
                      <div className="cinejoy-card-title-text">
                        <h2 className="cinejoy-heading">Ambient Lighting Mode</h2>
                        <p className="cinejoy-subtext">
                          Projects dynamic glow sampled from the video stage around the player frame.
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="cinejoy-card-content cinejoy-toggles-stack">
                    <label className="cinejoy-toggle-row">
                      <div className="cinejoy-toggle-text">
                        <span className="cinejoy-toggle-title">Enable Ambient Lighting</span>
                        <span className="cinejoy-toggle-desc">
                          Sample real-time cinematic color halos for high immersion.
                        </span>
                      </div>
                      <div className="cinejoy-switch">
                        <input
                          type="checkbox"
                          checked={ambientMode}
                          onChange={onToggleAmbientMode}
                          aria-label="Toggle ambient lighting mode"
                        />
                        <span className="cinejoy-slider" />
                      </div>
                    </label>

                    {ambientMode && (
                      <div className="cinejoy-ambient-sliders">
                        <div className="cinejoy-slider-group">
                          <div className="cinejoy-slider-header">
                            <label htmlFor="ambient-blur-slider" className="cinejoy-slider-label">
                              Ambient Blur Radius
                            </label>
                            <span className="cinejoy-slider-value">{ambientBlur}%</span>
                          </div>
                          <input
                            id="ambient-blur-slider"
                            type="range"
                            min="0"
                            max="100"
                            value={ambientBlur}
                            className="cinejoy-range-input"
                            onChange={(e) => onAmbientBlurChange?.(Number(e.target.value))}
                            aria-label="Ambient blur slider"
                          />
                        </div>

                        <div className="cinejoy-slider-group">
                          <div className="cinejoy-slider-header">
                            <label
                              htmlFor="ambient-spread-slider"
                              className="cinejoy-slider-label"
                            >
                              Ambient Spread Width
                            </label>
                            <span className="cinejoy-slider-value">{ambientSpread}%</span>
                          </div>
                          <input
                            id="ambient-spread-slider"
                            type="range"
                            min="50"
                            max="150"
                            value={ambientSpread}
                            className="cinejoy-range-input"
                            onChange={(e) => onAmbientSpreadChange?.(Number(e.target.value))}
                            aria-label="Ambient spread slider"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </section>
              )}

              {/* User Section 5: Device Persistence */}
              <section className="cinejoy-framed-card">
                <div className="cinejoy-card-header">
                  <div className="cinejoy-card-title-row">
                    <div className="cinejoy-icon-pill">
                      <Shield size={16} strokeWidth={2} />
                    </div>
                    <div className="cinejoy-card-title-text">
                      <h2 className="cinejoy-heading">Device Session Memory</h2>
                      <p className="cinejoy-subtext">
                        Remember your user settings, display moniker, and avatar on this browser.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="cinejoy-card-content">
                  <label className="cinejoy-toggle-row">
                    <div className="cinejoy-toggle-text">
                      <span className="cinejoy-toggle-title">Remember my settings</span>
                      <span className="cinejoy-toggle-desc">
                        Persists your moniker, avatar, and ambient configurations locally.
                      </span>
                    </div>
                    <div className="cinejoy-switch">
                      <input
                        type="checkbox"
                        checked={localUser.rememberMe}
                        onChange={(e) =>
                          setLocalUser({ ...localUser, rememberMe: e.target.checked })
                        }
                        aria-label="Remember user settings locally"
                      />
                      <span className="cinejoy-slider" />
                    </div>
                  </label>
                </div>
              </section>

              {/* Modal Actions Footer */}
              <footer className="cinejoy-modal-footer">
                <button
                  type="button"
                  className="cinejoy-btn cinejoy-btn-secondary"
                  onClick={onClose}
                >
                  Cancel
                </button>
                <button type="submit" className="cinejoy-btn cinejoy-btn-primary">
                  <Check size={16} strokeWidth={2} />
                  <span>{saveSuccess ? 'Saved!' : 'Save User Settings'}</span>
                </button>
              </footer>
            </form>
          ) : (
            <div
              id="panel-audio-settings"
              role="tabpanel"
              aria-labelledby="tab-audio-settings"
              className="cinejoy-settings-stack"
            >
              {/* Audio Section 1: Master Controls */}
              <section className="cinejoy-framed-card">
                <div className="cinejoy-card-header">
                  <div className="cinejoy-card-title-row">
                    <div className="cinejoy-icon-pill">
                      <Volume2 size={16} strokeWidth={2} />
                    </div>
                    <div className="cinejoy-card-title-text">
                      <h2 className="cinejoy-heading">Master Audio Controls</h2>
                      <p className="cinejoy-subtext">
                        Global volume, instant mute, and synthesized party feedback
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    className="cinejoy-btn-text"
                    onClick={handleResetAudioToDefault}
                    title="Reset Audio Settings"
                  >
                    <RotateCcw size={14} />
                    <span>Reset</span>
                  </button>
                </div>

                <div className="cinejoy-card-body">
                  <div className="cinejoy-setting-row">
                    <div className="cinejoy-setting-meta">
                      <span className="cinejoy-label">Master Mute</span>
                      <span className="cinejoy-help">Silence all UI sound effects and soundboard playback</span>
                    </div>
                    <button
                      type="button"
                      className={`soundboard-mute-toggle ${soundPrefs.masterMute ? 'muted' : 'active'}`}
                      onClick={handleToggleAudioMute}
                      style={{
                        padding: '0.45rem 0.9rem',
                        borderRadius: '9999px',
                        fontSize: '0.82rem',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.4rem',
                        border: '1px solid rgba(255, 255, 255, 0.15)',
                        background: soundPrefs.masterMute ? 'rgba(239, 68, 68, 0.2)' : 'rgba(255, 210, 31, 0.15)',
                        color: soundPrefs.masterMute ? '#f87171' : '#ffd21f',
                        cursor: 'pointer',
                        fontWeight: 600,
                      }}
                    >
                      {soundPrefs.masterMute ? <VolumeX size={15} /> : <Volume2 size={15} />}
                      <span>{soundPrefs.masterMute ? 'Muted' : 'Unmuted'}</span>
                    </button>
                  </div>

                  <div className="cinejoy-setting-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: '0.5rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span className="cinejoy-label">Master Volume</span>
                      <strong style={{ color: 'var(--accent)', fontSize: '0.9rem' }}>
                        {Math.round(soundPrefs.masterVolume * 100)}%
                      </strong>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.05"
                      value={soundPrefs.masterVolume}
                      onChange={handleAudioVolumeChange}
                      className="cinejoy-range-slider"
                      aria-label="Master audio volume"
                    />
                  </div>
                </div>
              </section>

              {/* Audio Section 2: Party Soundboard Matrix */}
              <section className="cinejoy-framed-card">
                <div className="cinejoy-card-header">
                  <div className="cinejoy-card-title-row">
                    <div className="cinejoy-icon-pill" style={{ color: '#ec4899', background: 'rgba(236, 72, 153, 0.12)' }}>
                      <Sparkles size={16} strokeWidth={2} />
                    </div>
                    <div className="cinejoy-card-title-text">
                      <h2 className="cinejoy-heading">Watch Party Soundboard</h2>
                      <p className="cinejoy-subtext">
                        Play effects locally or broadcast in real-time to everyone in the room
                      </p>
                    </div>
                  </div>
                  {soundCooldownRemaining > 0 && (
                    <span style={{ fontSize: '0.78rem', color: '#f59e0b', fontWeight: 600 }}>
                      Cooldown: {(soundCooldownRemaining / 1000).toFixed(1)}s
                    </span>
                  )}
                </div>

                <div className="cinejoy-card-body">
                  <div className="soundboard-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '0.75rem' }}>
                    {SOUNDBOARD_SOUNDS.map((sound) => {
                      const isPlaying = activeSoundPlaying === sound.id;
                      return (
                        <div
                          key={sound.id}
                          className={`soundboard-card ${isPlaying ? 'playing' : ''}`}
                          style={{
                            background: 'rgba(255, 255, 255, 0.04)',
                            border: '1px solid rgba(255, 255, 255, 0.08)',
                            borderRadius: '12px',
                            padding: '0.75rem',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '0.5rem',
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <span style={{ fontSize: '1.4rem' }}>{sound.icon}</span>
                            <div>
                              <div style={{ fontWeight: 600, fontSize: '0.88rem', color: '#f8fafc' }}>
                                {sound.label}
                              </div>
                              <div style={{ fontSize: '0.72rem', color: '#94a3b8' }}>
                                {sound.description}
                              </div>
                            </div>
                          </div>

                          <div style={{ display: 'flex', gap: '0.4rem', marginTop: 'auto' }}>
                            <button
                              type="button"
                              className="btn btn-secondary btn-sm"
                              onClick={() => handleLocalPlaySound(sound.id)}
                              title="Listen locally"
                              style={{ flex: 1, padding: '0.4rem 0.5rem', fontSize: '0.75rem' }}
                            >
                              <Play size={12} />
                              <span>Preview</span>
                            </button>
                            <button
                              type="button"
                              className="btn btn-primary btn-sm"
                              onClick={() => handleBroadcastSound(sound.id)}
                              disabled={soundCooldownRemaining > 0}
                              title="Broadcast to everyone in the party"
                              style={{ flex: 1.2, padding: '0.4rem 0.5rem', fontSize: '0.75rem' }}
                            >
                              <Radio size={12} />
                              <span>Broadcast</span>
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </section>

              {/* Audio Section 3: Sound Event Toggles */}
              <section className="cinejoy-framed-card">
                <div className="cinejoy-card-header">
                  <div className="cinejoy-card-title-row">
                    <div className="cinejoy-icon-pill" style={{ color: '#38bdf8', background: 'rgba(56, 189, 248, 0.12)' }}>
                      <Activity size={16} strokeWidth={2} />
                    </div>
                    <div className="cinejoy-card-title-text">
                      <h2 className="cinejoy-heading">Event Sound Notifications</h2>
                      <p className="cinejoy-subtext">Toggle individual tactile audio feedback events</p>
                    </div>
                  </div>
                </div>

                <div className="cinejoy-card-body">
                  <label className="cinejoy-setting-row">
                    <div className="cinejoy-setting-meta">
                      <span className="cinejoy-label">Participant Join Chime</span>
                      <span className="cinejoy-help">Ascending dual-tone chime when a friend enters the room</span>
                    </div>
                    <div className="cinejoy-switch">
                      <input
                        type="checkbox"
                        checked={soundPrefs.events.roomJoin}
                        onChange={() => handleToggleAudioEvent('roomJoin')}
                      />
                      <span className="cinejoy-slider" />
                    </div>
                  </label>

                  <label className="cinejoy-setting-row">
                    <div className="cinejoy-setting-meta">
                      <span className="cinejoy-label">Participant Leave Alert</span>
                      <span className="cinejoy-help">Descending tone when a participant disconnects</span>
                    </div>
                    <div className="cinejoy-switch">
                      <input
                        type="checkbox"
                        checked={soundPrefs.events.roomLeave}
                        onChange={() => handleToggleAudioEvent('roomLeave')}
                      />
                      <span className="cinejoy-slider" />
                    </div>
                  </label>

                  <label className="cinejoy-setting-row">
                    <div className="cinejoy-setting-meta">
                      <span className="cinejoy-label">Incoming Chat Messages</span>
                      <span className="cinejoy-help">Soft organic bubble blip when a new message arrives</span>
                    </div>
                    <div className="cinejoy-switch">
                      <input
                        type="checkbox"
                        checked={soundPrefs.events.chatReceive}
                        onChange={() => handleToggleAudioEvent('chatReceive')}
                      />
                      <span className="cinejoy-slider" />
                    </div>
                  </label>

                  <label className="cinejoy-setting-row">
                    <div className="cinejoy-setting-meta">
                      <span className="cinejoy-label">Outgoing Chat Message</span>
                      <span className="cinejoy-help">Subtle chirp confirmation when sending a message</span>
                    </div>
                    <div className="cinejoy-switch">
                      <input
                        type="checkbox"
                        checked={soundPrefs.events.chatSend}
                        onChange={() => handleToggleAudioEvent('chatSend')}
                      />
                      <span className="cinejoy-slider" />
                    </div>
                  </label>

                  <label className="cinejoy-setting-row">
                    <div className="cinejoy-setting-meta">
                      <span className="cinejoy-label">Live Emoji Reactions</span>
                      <span className="cinejoy-help">Springy upward pop sound on floating reaction bursts</span>
                    </div>
                    <div className="cinejoy-switch">
                      <input
                        type="checkbox"
                        checked={soundPrefs.events.reaction}
                        onChange={() => handleToggleAudioEvent('reaction')}
                      />
                      <span className="cinejoy-slider" />
                    </div>
                  </label>

                  <label className="cinejoy-setting-row">
                    <div className="cinejoy-setting-meta">
                      <span className="cinejoy-label">Link & Code Copy Chime</span>
                      <span className="cinejoy-help">Satisfying bell chime when copying party links or codes</span>
                    </div>
                    <div className="cinejoy-switch">
                      <input
                        type="checkbox"
                        checked={soundPrefs.events.linkCopy}
                        onChange={() => handleToggleAudioEvent('linkCopy')}
                      />
                      <span className="cinejoy-slider" />
                    </div>
                  </label>

                  <label className="cinejoy-setting-row">
                    <div className="cinejoy-setting-meta">
                      <span className="cinejoy-label">Incoming Soundboard Broadcasts</span>
                      <span className="cinejoy-help">Allow party members to trigger sound effects on your device</span>
                    </div>
                    <div className="cinejoy-switch">
                      <input
                        type="checkbox"
                        checked={soundPrefs.events.soundboard}
                        onChange={() => handleToggleAudioEvent('soundboard')}
                      />
                      <span className="cinejoy-slider" />
                    </div>
                  </label>
                </div>
              </section>

              {/* Actions Footer */}
              <footer className="cinejoy-modal-footer">
                <button
                  type="button"
                  className="cinejoy-btn cinejoy-btn-primary"
                  onClick={onClose}
                >
                  <Check size={16} strokeWidth={2} />
                  <span>Done</span>
                </button>
              </footer>
            </div>
          )}
        </main>
      </div>
    </div>
  );
};
