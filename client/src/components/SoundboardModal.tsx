import React, { useState, useEffect } from 'react';
import { Socket } from 'socket.io-client';
import {
  X,
  Volume2,
  VolumeX,
  Radio,
  Sparkles,
  Sliders,
  Check,
  AlertCircle,
  Play,
  RotateCcw,
} from 'lucide-react';
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

interface SoundboardModalProps {
  isOpen: boolean;
  onClose: () => void;
  socket?: Socket | null;
  onNotify?: (msg: string, type: 'success' | 'error' | 'info') => void;
}

export const SoundboardModal: React.FC<SoundboardModalProps> = ({
  isOpen,
  onClose,
  socket,
  onNotify,
}) => {
  const [prefs, setPrefs] = useState<SoundPreferences>(getSoundPreferences);
  const [cooldownRemaining, setCooldownRemaining] = useState<number>(0);
  const [activeSoundPlaying, setActiveSoundPlaying] = useState<string | null>(null);

  // Sync state whenever modal opens
  useEffect(() => {
    if (isOpen) {
      setPrefs(getSoundPreferences());
    }
  }, [isOpen]);

  // Cooldown countdown timer
  useEffect(() => {
    if (cooldownRemaining <= 0) return;
    const interval = setInterval(() => {
      setCooldownRemaining((prev) => Math.max(0, prev - 100));
    }, 100);
    return () => clearInterval(interval);
  }, [cooldownRemaining]);

  const handleToggleMute = () => {
    const updated = setSoundPreferences((prev) => ({
      ...prev,
      masterMute: !prev.masterMute,
    }));
    setPrefs(updated);
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    const updated = setSoundPreferences((prev) => ({
      ...prev,
      masterVolume: val,
    }));
    setPrefs(updated);
  };

  const handleToggleEvent = (key: keyof SoundPreferences['events']) => {
    const updated = setSoundPreferences((prev) => ({
      ...prev,
      events: {
        ...prev.events,
        [key]: !prev.events[key],
      },
    }));
    setPrefs(updated);
  };

  // 1. Local Preview only (headphones/speakers only for this user)
  const handleLocalPlay = (soundId: SoundboardEffectId) => {
    setActiveSoundPlaying(soundId);
    playSoundboardEffect(soundId);
    if (soundId === 'cheer') {
      firePartyConfetti({ particleCount: 35 });
    }
    setTimeout(() => setActiveSoundPlaying(null), 600);
  };

  // 2. Broadcast sound to whole room over socket
  const handleBroadcastSound = (soundId: SoundboardEffectId) => {
    if (!canPlaySoundboard()) {
      onNotify?.('Please wait a moment before sending another party sound.', 'info');
      return;
    }

    // Play locally
    handleLocalPlay(soundId);

    // Broadcast over socket if connected
    if (socket && socket.connected) {
      socket.emit('send_sound_effect', { soundId });
      setCooldownRemaining(prefs.soundboardCooldownMs);
      onNotify?.(`Broadcasted ${soundId} sound to party!`, 'success');
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="soundboard-modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="soundboard-modal-title"
    >
      <div className="soundboard-modal-card">
        {/* Header */}
        <div className="soundboard-modal-header">
          <div className="soundboard-title-group">
            <div className="soundboard-header-icon">
              <Volume2 size={20} color="var(--accent)" />
            </div>
            <div>
              <h2 id="soundboard-modal-title" className="soundboard-modal-title">
                Watch Party Soundboard & Audio FX
              </h2>
              <p className="soundboard-modal-subtitle">
                Real-time synthesized effects and audio feedback
              </p>
            </div>
          </div>
          <button
            type="button"
            className="btn-icon-close"
            onClick={onClose}
            aria-label="Close soundboard"
          >
            <X size={18} />
          </button>
        </div>

        {/* Master Controls Section */}
        <div className="soundboard-master-bar">
          <div className="soundboard-volume-row">
            <button
              type="button"
              className={`soundboard-mute-toggle ${prefs.masterMute ? 'muted' : 'active'}`}
              onClick={handleToggleMute}
              title={prefs.masterMute ? 'Unmute UI Audio' : 'Mute UI Audio'}
            >
              {prefs.masterMute ? <VolumeX size={16} /> : <Volume2 size={16} />}
              <span>{prefs.masterMute ? 'Muted' : `${Math.round(prefs.masterVolume * 100)}%`}</span>
            </button>

            <div className="soundboard-slider-wrap">
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={prefs.masterMute ? 0 : prefs.masterVolume}
                onChange={handleVolumeChange}
                disabled={prefs.masterMute}
                className="soundboard-volume-slider"
                aria-label="Master volume slider"
              />
            </div>
          </div>

          {cooldownRemaining > 0 && (
            <div className="soundboard-cooldown-pill" role="status">
              <span>Cooldown: {(cooldownRemaining / 1000).toFixed(1)}s</span>
            </div>
          )}
        </div>

        {/* Soundboard Grid */}
        <div className="soundboard-section">
          <div className="soundboard-section-label">
            <Sparkles size={14} />
            <span>Party Sound FX (Click to Send to Room)</span>
          </div>

          <div className="soundboard-grid">
            {SOUNDBOARD_SOUNDS.map((sound) => {
              const isPlaying = activeSoundPlaying === sound.id;
              const isCooldown = cooldownRemaining > 0;
              return (
                <div key={sound.id} className="soundboard-card">
                  <div className="soundboard-card-top">
                    <span className="soundboard-emoji">{sound.icon}</span>
                    <div className="soundboard-card-info">
                      <span className="soundboard-card-name">{sound.label}</span>
                      <span className="soundboard-card-desc">{sound.description}</span>
                    </div>
                  </div>

                  <div className="soundboard-card-actions">
                    <button
                      type="button"
                      className="btn-sound-preview"
                      onClick={() => handleLocalPlay(sound.id)}
                      title="Preview sound locally only"
                      aria-label={`Preview ${sound.label} locally`}
                    >
                      <Play size={12} fill="currentColor" />
                      <span>Preview</span>
                    </button>

                    <button
                      type="button"
                      className={`btn-sound-broadcast ${isPlaying ? 'playing' : ''}`}
                      onClick={() => handleBroadcastSound(sound.id)}
                      disabled={isCooldown || prefs.masterMute}
                      title="Broadcast to everyone in room"
                      aria-label={`Send ${sound.label} to room`}
                    >
                      <Radio size={12} />
                      <span>Send to Party</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* UI Event Chimes Configuration */}
        <div className="soundboard-section soundboard-events-section">
          <div className="soundboard-section-label">
            <Sliders size={14} />
            <span>UI Event Sound Chimes</span>
          </div>

          <div className="soundboard-toggles-grid">
            {[
              { key: 'roomJoin', label: 'Participant Joined' },
              { key: 'roomLeave', label: 'Participant Left' },
              { key: 'chatReceive', label: 'Incoming Chat Message' },
              { key: 'chatSend', label: 'Outgoing Chat Message' },
              { key: 'reaction', label: 'Emoji Reaction Chimes' },
              { key: 'linkCopy', label: 'Link / Room Code Copy' },
            ].map(({ key, label }) => {
              const eventKey = key as keyof SoundPreferences['events'];
              const isEnabled = prefs.events[eventKey];
              return (
                <button
                  key={key}
                  type="button"
                  className={`sound-event-chip ${isEnabled ? 'enabled' : 'disabled'}`}
                  onClick={() => handleToggleEvent(eventKey)}
                  aria-pressed={isEnabled}
                >
                  <span className="event-chip-indicator">
                    {isEnabled ? <Check size={12} /> : <X size={12} />}
                  </span>
                  <span className="event-chip-label">{label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Footer */}
        <div className="soundboard-modal-footer">
          <span className="soundboard-footer-hint">
            💡 Sound effects use lightweight Web Audio synthesis with zero external downloads.
          </span>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={onClose}
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
