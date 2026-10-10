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
} from 'lucide-react';
import { UserSettings, RoomSettingsData, Role } from '../types.js';
import { AvatarPicker } from './AnimeAvatar.js';

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
  initialTab?: 'room' | 'user';
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
}) => {
  const [activeTab, setActiveTab] = useState<'room' | 'user'>(initialTab);
  const [localUser, setLocalUser] = useState<UserSettings>(userSettings);
  const [localRoom, setLocalRoom] = useState<RoomSettingsData>(roomSettings);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setLocalUser(userSettings);
    setLocalRoom(roomSettings);
    setDeleteConfirm(false);
    setSaveSuccess(false);
  }, [isOpen, userSettings, roomSettings]);

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
              <span className="cinejoy-settings-badge">CineJoy Settings</span>
              <h1 id="settings-dialog-title" className="cinejoy-settings-title">
                {activeTab === 'room' ? 'Room Settings' : 'User Settings'}
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
              <span>Room Settings</span>
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
              <span>User Settings</span>
            </button>
          </nav>
        </header>

        {/* Modal Scrollable Body */}
        <main className="cinejoy-settings-body">
          {activeTab === 'room' ? (
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
                <button
                  type="button"
                  className="cinejoy-btn cinejoy-btn-secondary"
                  onClick={onClose}
                >
                  Cancel
                </button>
                {isOwner && (
                  <button type="submit" className="cinejoy-btn cinejoy-btn-primary">
                    <Check size={16} strokeWidth={2} />
                    <span>{saveSuccess ? 'Saved!' : 'Save Room Settings'}</span>
                  </button>
                )}
              </footer>
            </form>
          ) : (
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
          )}
        </main>
      </div>
    </div>
  );
};
