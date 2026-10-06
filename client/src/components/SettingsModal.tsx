import React, { useEffect, useState } from 'react';
import { X, User, Sliders, Trash2, Check, Sparkles } from 'lucide-react';
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
}

const PRESET_COLORS = [
  '#2f618f',
  '#6366f1',
  '#8b5cf6',
  '#ec4899',
  '#10b981',
  '#f59e0b',
  '#06b6d4',
  '#e11d48',
  '#14b8a6',
];

const ROOM_THEMES: Array<{ value: RoomSettingsData['theme']; label: string; description: string }> = [
  { value: 'midnight', label: 'Midnight', description: 'Deep dark party room' },
  { value: 'ocean', label: 'Ocean', description: 'Cool blue atmosphere' },
  { value: 'forest', label: 'Forest', description: 'Calm green atmosphere' },
  { value: 'sunset', label: 'Sunset', description: 'Warm cinematic atmosphere' },
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
}) => {
  const [activeTab, setActiveTab] = useState<'user' | 'room'>('user');
  const [localUser, setLocalUser] = useState<UserSettings>(userSettings);
  const [localRoom, setLocalRoom] = useState<RoomSettingsData>(roomSettings);
  const [deleteConfirm, setDeleteConfirm] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setLocalUser(userSettings);
    setLocalRoom(roomSettings);
    setDeleteConfirm(false);
  }, [isOpen, userSettings, roomSettings]);

  if (!isOpen) return null;

  const isOwner = currentUserRole === 'HOST';

  const handleSaveUser = (e: React.FormEvent) => {
    e.preventDefault();
    onUpdateUserSettings(localUser);
    onClose();
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
    onClose();
  };

  const permissionRows: { key: keyof RoomSettingsData['permissions']; label: string }[] = [
    { key: 'add', label: 'Add' },
    { key: 'remove', label: 'Remove' },
    { key: 'move', label: 'Move' },
    { key: 'playPause', label: 'Play/Pause' },
    { key: 'seek', label: 'Seek' },
    { key: 'skip', label: 'Skip' },
    { key: 'chatSend', label: 'Chat Send' },
    { key: 'chatDelete', label: 'Chat Delete' },
    { key: 'ban', label: 'Ban' },
  ];

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card glass-panel" onClick={(e) => e.stopPropagation()}>
        {/* Modal Header */}
        <div className="modal-header">
          <div className="modal-tabs">
            <button
              type="button"
              className={`modal-tab-btn ${activeTab === 'user' ? 'active' : ''}`}
              onClick={() => setActiveTab('user')}
            >
              <User size={16} />
              <span>User Settings</span>
            </button>
            <button
              type="button"
              className={`modal-tab-btn ${activeTab === 'room' ? 'active' : ''}`}
              onClick={() => setActiveTab('room')}
            >
              <Sliders size={16} />
              <span>Room Settings</span>
            </button>
          </div>
          <button type="button" className="btn-icon modal-close-btn" onClick={onClose} aria-label="Close settings">
            <X size={20} />
          </button>
        </div>

        {/* Modal Content */}
        <div className="modal-body">
          {activeTab === 'user' ? (
            <form onSubmit={handleSaveUser} className="settings-form">
              {/* Avatar Picker */}
              <div className="settings-section">
                <label className="settings-label">Anime Avatar</label>
                <p className="settings-description">
                  Choose an anime character to use as your profile picture in chat.
                </p>
                <AvatarPicker
                  selectedId={localUser.avatarId}
                  username={localUser.name}
                  onSelect={(id) => setLocalUser({ ...localUser, avatarId: id })}
                />
              </div>

              {/* User Name */}
              <div className="settings-section">
                <label className="settings-label" htmlFor="user-name-input">Name</label>
                <p className="settings-description">
                  Your user name will be visible in the viewers list and the chat.
                </p>
                <input
                  id="user-name-input"
                  type="text"
                  className="input-field"
                  value={localUser.name}
                  onChange={(e) => setLocalUser({ ...localUser, name: e.target.value })}
                  placeholder="e.g. BrightStinkbug"
                  maxLength={30}
                  required
                />
              </div>

              {/* User Color */}
              <div className="settings-section">
                <label className="settings-label">Color</label>
                <p className="settings-description">
                  Your color will be visible in the chat.
                </p>
                <div className="color-picker-row">
                  <input
                    type="color"
                    className="color-swatch-input"
                    value={localUser.color}
                    onChange={(e) => setLocalUser({ ...localUser, color: e.target.value })}
                  />
                  <input
                    type="text"
                    className="input-field color-hex-field"
                    value={localUser.color}
                    onChange={(e) => setLocalUser({ ...localUser, color: e.target.value })}
                  />
                </div>
                <div className="color-swatches-list">
                  {PRESET_COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      className={`preset-color-pill ${localUser.color === c ? 'selected' : ''}`}
                      style={{ backgroundColor: c }}
                      onClick={() => setLocalUser({ ...localUser, color: c })}
                      title={c}
                    />
                  ))}
                </div>
              </div>

              {/* Live Preview */}
              <div className="settings-section">
                <label className="settings-label">Preview</label>
                <div className="preview-chat-card">
                  <div className="preview-chat-row">
                    <span className="preview-author" style={{ color: localUser.color }}>
                      {localUser.name || 'BrightStinkbug'}:
                    </span>
                    <span className="preview-text">Hi there!</span>
                  </div>
                  <div className="preview-chat-row">
                    <span className="preview-author" style={{ color: localUser.color }}>
                      {localUser.name || 'BrightStinkbug'}:
                    </span>
                    <span className="preview-text">Choose a color you like 😊</span>
                  </div>
                </div>
              </div>

              {/* Ambient Mode */}
              {onToggleAmbientMode && (
                <div className="settings-section">
                  <label className="settings-label" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <Sparkles size={15} color="var(--accent)" />
                    <span>Ambient Mode</span>
                  </label>
                  <p className="settings-description">
                    Spreads sampled colors from the current video's thumbnail around the player.
                  </p>
                  <label className="checkbox-row" style={{ cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={ambientMode}
                      onChange={onToggleAmbientMode}
                    />
                    <span>Enable Ambient Mode</span>
                  </label>
                  {ambientMode && (
                    <div className="ambient-light-controls">
                      <label className="ambient-light-control" htmlFor="ambient-blur">
                        <span className="ambient-light-control-heading">
                          <span>Blur</span>
                          <output htmlFor="ambient-blur">{ambientBlur}%</output>
                        </span>
                        <input
                          id="ambient-blur"
                          type="range"
                          min="0"
                          max="100"
                          value={ambientBlur}
                          onChange={(event) => onAmbientBlurChange?.(Number(event.target.value))}
                        />
                      </label>
                      <label className="ambient-light-control" htmlFor="ambient-spread">
                        <span className="ambient-light-control-heading">
                          <span>Spread</span>
                          <output htmlFor="ambient-spread">{ambientSpread}%</output>
                        </span>
                        <input
                          id="ambient-spread"
                          type="range"
                          min="50"
                          max="150"
                          value={ambientSpread}
                          onChange={(event) => onAmbientSpreadChange?.(Number(event.target.value))}
                        />
                      </label>
                    </div>
                  )}
                </div>
              )}

              {/* Persistence */}
              <div className="settings-section">
                <label className="settings-label">Persistence</label>
                <p className="settings-description">
                  Your user settings will not be used when visiting other rooms.
                </p>
                <label className="checkbox-row">
                  <input
                    type="checkbox"
                    checked={localUser.rememberMe}
                    onChange={(e) => setLocalUser({ ...localUser, rememberMe: e.target.checked })}
                  />
                  <span>Remember Me</span>
                </label>
              </div>

              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={onClose}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  <Check size={16} />
                  Save User Settings
                </button>
              </div>
            </form>
          ) : (
            <form onSubmit={handleSaveRoom} className="settings-form">
              {/* Room Name */}
              <div className="settings-section">
                <label className="settings-label" htmlFor="room-name-input">Name</label>
                <p className="settings-description">Name of the room.</p>
                <input
                  id="room-name-input"
                  type="text"
                  className="input-field"
                  value={localRoom.name}
                  disabled={!isOwner}
                  onChange={(e) => setLocalRoom({ ...localRoom, name: e.target.value })}
                  placeholder="Room #744"
                />
              </div>

              <div className="settings-section">
                <label className="settings-label">Room appearance</label>
                <p className="settings-description">Choose a shared visual style and accent color for this room.</p>
                <div className="room-theme-grid">
                  {ROOM_THEMES.map((theme) => (
                    <button
                      key={theme.value}
                      type="button"
                      className={`room-theme-option ${localRoom.theme === theme.value ? 'selected' : ''}`}
                      disabled={!isOwner}
                      onClick={() => setLocalRoom({ ...localRoom, theme: theme.value })}
                    >
                      <strong>{theme.label}</strong>
                      <span>{theme.description}</span>
                    </button>
                  ))}
                </div>
                <div className="color-picker-row room-accent-picker">
                  <input
                    type="color"
                    className="color-swatch-input"
                    value={localRoom.accentColor}
                    disabled={!isOwner}
                    onChange={(e) => setLocalRoom({ ...localRoom, accentColor: e.target.value })}
                    aria-label="Room accent color"
                  />
                  <input
                    type="text"
                    className="input-field color-hex-field"
                    value={localRoom.accentColor}
                    disabled={!isOwner}
                    pattern="^#[0-9a-fA-F]{6}$"
                    onChange={(e) => setLocalRoom({ ...localRoom, accentColor: e.target.value })}
                    aria-label="Room accent hex color"
                  />
                </div>
              </div>

              {/* Permissions Matrix */}
              <div className="settings-section">
                <label className="settings-label">Permissions</label>
                <p className="settings-description">Assign permissions for each group.</p>

                <div className="permissions-table-wrapper">
                  <table className="permissions-table">
                    <thead>
                      <tr>
                        <th>Permission</th>
                        <th>Viewer</th>
                        <th>Moderator</th>
                        <th>Owner</th>
                      </tr>
                    </thead>
                    <tbody>
                      {permissionRows.map((row) => (
                        <tr key={row.key}>
                          <td className="perm-label">{row.label}</td>
                          <td className="perm-check">
                            <input
                              type="checkbox"
                              checked={localRoom.permissions[row.key]?.viewer}
                              disabled={!isOwner}
                              onChange={() => handleTogglePermission(row.key, 'viewer')}
                            />
                          </td>
                          <td className="perm-check">
                            <input
                              type="checkbox"
                              checked={localRoom.permissions[row.key]?.moderator}
                              disabled={!isOwner}
                              onChange={() => handleTogglePermission(row.key, 'moderator')}
                            />
                          </td>
                          <td className="perm-check">
                            <input
                              type="checkbox"
                              checked={localRoom.permissions[row.key]?.owner}
                              disabled={!isOwner}
                              onChange={() => handleTogglePermission(row.key, 'owner')}
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Playlist Settings */}
              <div className="settings-section">
                <label className="settings-label">Playlist</label>
                <div className="settings-subgroup">
                  <span className="settings-sublabel">Mode</span>
                  <label className="checkbox-row">
                    <input
                      type="checkbox"
                      checked={localRoom.autoRemovePlayed}
                      disabled={!isOwner}
                      onChange={(e) => setLocalRoom({ ...localRoom, autoRemovePlayed: e.target.checked })}
                    />
                    <span>Videos will be removed from the list when they are played.</span>
                  </label>

                  <label className="checkbox-row" style={{ marginTop: '0.4rem' }}>
                    <input
                      type="checkbox"
                      checked={localRoom.shuffle}
                      disabled={!isOwner}
                      onChange={(e) => setLocalRoom({ ...localRoom, shuffle: e.target.checked })}
                    />
                    <span>Shuffle</span>
                  </label>
                </div>
              </div>

              {/* Chat Settings */}
              <div className="settings-section">
                <label className="settings-label">Chat</label>
                <label className="checkbox-row">
                  <input
                    type="checkbox"
                    checked={localRoom.allowLinks}
                    disabled={!isOwner}
                    onChange={(e) => setLocalRoom({ ...localRoom, allowLinks: e.target.checked })}
                  />
                  <span>Allow links</span>
                </label>
                <label className="checkbox-row" style={{ marginTop: '0.4rem' }}>
                  <input
                    type="checkbox"
                    checked={localRoom.allowEmbeddedLinks}
                    disabled={!isOwner}
                    onChange={(e) => setLocalRoom({ ...localRoom, allowEmbeddedLinks: e.target.checked })}
                  />
                  <span>Allow embedded links</span>
                </label>
              </div>

              {/* Persistence */}
              <div className="settings-section">
                <label className="settings-label">Persistence</label>
                <p className="settings-description">
                  This room is temporary and will be deleted automatically if it's not used. Click "Save Room" to add this room to your permanent rooms.
                </p>
                <span className="settings-hint">
                  You need to be logged in to use this feature.
                </span>
              </div>

              {/* Delete Room */}
              {isOwner && (
                <div className="settings-section danger-zone">
                  <label className="settings-label text-danger">Delete room</label>
                  <p className="settings-description">
                    By clicking "Delete room" this room will be deleted immediately.
                  </p>
                  {!deleteConfirm ? (
                    <button
                      type="button"
                      className="btn btn-danger"
                      onClick={() => setDeleteConfirm(true)}
                    >
                      <Trash2 size={16} />
                      Delete room
                    </button>
                  ) : (
                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                      <button
                        type="button"
                        className="btn btn-danger"
                        onClick={onDeleteRoom}
                      >
                        Confirm Delete Room
                      </button>
                      <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={() => setDeleteConfirm(false)}
                      >
                        Cancel
                      </button>
                    </div>
                  )}
                </div>
              )}

              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={onClose}>
                  Cancel
                </button>
                {isOwner && (
                  <button type="submit" className="btn btn-primary">
                    <Check size={16} />
                    Save Room Settings
                  </button>
                )}
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
