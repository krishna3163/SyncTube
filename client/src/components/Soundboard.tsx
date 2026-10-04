import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Socket } from 'socket.io-client';
import { Volume2, VolumeX, Music } from 'lucide-react';

interface SoundboardProps {
  socket: Socket | null;
  onNotify?: (msg: string, type: 'info' | 'success' | 'error') => void;
}

interface SoundItem {
  id: 'applause' | 'airhorn' | 'cheer' | 'nani' | 'wow' | 'boom';
  label: string;
  emoji: string;
}

const SOUNDS: SoundItem[] = [
  { id: 'applause', label: 'Applause', emoji: '👏' },
  { id: 'airhorn',  label: 'Airhorn',  emoji: '🎺' },
  { id: 'cheer',    label: 'Cheer',    emoji: '🎉' },
  { id: 'nani',     label: 'Nani?!',   emoji: '⚡' },
  { id: 'wow',      label: 'Wow!',     emoji: '✨' },
  { id: 'boom',     label: 'Boom',     emoji: '💥' },
];

export const Soundboard: React.FC<SoundboardProps> = ({ socket, onNotify }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isMuted, setIsMuted] = useState<boolean>(() => {
    return localStorage.getItem('synctube_soundboard_muted') === 'true';
  });
  const audioCtxRef = useRef<AudioContext | null>(null);

  const getAudioContext = useCallback(() => {
    if (!audioCtxRef.current) {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        audioCtxRef.current = new AudioCtx();
      }
    }
    if (audioCtxRef.current && audioCtxRef.current.state === 'suspended') {
      audioCtxRef.current.resume();
    }
    return audioCtxRef.current;
  }, []);

  // Web Audio Synthesizer for rich party sound effects
  const playSynthesizedSound = useCallback((soundId: string) => {
    if (isMuted) return;
    const ctx = getAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;

    if (soundId === 'boom') {
      // Sub-bass 808 boom drop
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(140, now);
      osc.frequency.exponentialRampToValueAtTime(30, now + 0.6);
      gain.gain.setValueAtTime(0.7, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.7);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.75);
    } else if (soundId === 'airhorn') {
      // Classic party airhorn tones (dual oscillating frequencies)
      const freqs = [466.16, 622.25]; // Bb4, Eb5
      freqs.forEach((freq) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(freq, now);
        // stutter burst
        gain.gain.setValueAtTime(0.25, now);
        gain.gain.setValueAtTime(0.01, now + 0.12);
        gain.gain.setValueAtTime(0.25, now + 0.15);
        gain.gain.setValueAtTime(0.01, now + 0.27);
        gain.gain.setValueAtTime(0.3, now + 0.3);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.65);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.7);
      });
    } else if (soundId === 'cheer') {
      // Fanfare chords arpeggio
      const notes = [261.63, 329.63, 392.0, 523.25]; // C4, E4, G4, C5
      notes.forEach((freq, idx) => {
        const start = now + idx * 0.08;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, start);
        gain.gain.setValueAtTime(0.25, start);
        gain.gain.exponentialRampToValueAtTime(0.001, start + 0.5);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(start);
        osc.stop(start + 0.55);
      });
    } else if (soundId === 'nani') {
      // Sharp anime dramatic rising mystery bend
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(440, now);
      osc.frequency.exponentialRampToValueAtTime(1200, now + 0.35);
      gain.gain.setValueAtTime(0.3, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.5);
    } else if (soundId === 'wow') {
      // Synth wow sweep
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(300, now);
      osc.frequency.exponentialRampToValueAtTime(800, now + 0.2);
      osc.frequency.exponentialRampToValueAtTime(500, now + 0.45);
      gain.gain.setValueAtTime(0.28, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.55);
    } else if (soundId === 'applause') {
      // Rhythmic clapping noise burst
      for (let i = 0; i < 6; i++) {
        const clapTime = now + i * 0.09 + (Math.random() * 0.02);
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(150 + Math.random() * 80, clapTime);
        gain.gain.setValueAtTime(0.2, clapTime);
        gain.gain.exponentialRampToValueAtTime(0.001, clapTime + 0.06);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(clapTime);
        osc.stop(clapTime + 0.07);
      }
    }
  }, [getAudioContext, isMuted]);

  // Listen to remote sound events from socket
  useEffect(() => {
    if (!socket) return;

    const handleSoundReceived = (data: { soundId: string; username: string }) => {
      playSynthesizedSound(data.soundId);
      if (onNotify && !isMuted) {
        const found = SOUNDS.find((s) => s.id === data.soundId);
        onNotify(`${data.username} played ${found?.emoji || '🔊'} ${found?.label || data.soundId}`, 'info');
      }
    };

    socket.on('sound_effect_received', handleSoundReceived);
    return () => {
      socket.off('sound_effect_received', handleSoundReceived);
    };
  }, [socket, playSynthesizedSound, onNotify, isMuted]);

  const triggerSound = (soundId: 'applause' | 'airhorn' | 'cheer' | 'nani' | 'wow' | 'boom') => {
    playSynthesizedSound(soundId);
    if (socket) {
      socket.emit('send_sound_effect', { soundId });
    }
  };

  const toggleMute = () => {
    setIsMuted((prev) => {
      const next = !prev;
      localStorage.setItem('synctube_soundboard_muted', String(next));
      if (onNotify) {
        onNotify(next ? 'Soundboard effects muted' : 'Soundboard effects unmuted', 'info');
      }
      return next;
    });
  };

  return (
    <div className={`soundboard-container ${isOpen ? 'open' : ''}`}>
      <div className="soundboard-trigger-wrap">
        <button
          type="button"
          className="btn-icon soundboard-toggle-btn"
          onClick={() => setIsOpen((prev) => !prev)}
          title={isOpen ? 'Close Soundboard' : 'Watch Party Soundboard'}
          aria-label="Toggle Soundboard"
        >
          <Music size={17} />
        </button>
      </div>

      {isOpen && (
        <div className="soundboard-panel glass-panel">
          <div className="soundboard-header">
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <Music size={15} color="var(--accent)" />
              <span className="soundboard-title">Soundboard</span>
            </div>
            <button
              type="button"
              className={`btn-icon soundboard-mute-btn ${isMuted ? 'muted' : ''}`}
              onClick={toggleMute}
              title={isMuted ? 'Unmute Soundboard' : 'Mute Soundboard'}
              aria-label="Toggle Soundboard Mute"
            >
              {isMuted ? <VolumeX size={15} color="var(--danger)" /> : <Volume2 size={15} />}
            </button>
          </div>

          <div className="soundboard-grid">
            {SOUNDS.map((snd) => (
              <button
                key={snd.id}
                type="button"
                className="soundboard-btn"
                onClick={() => triggerSound(snd.id)}
                title={`Play ${snd.label}`}
              >
                <span className="soundboard-btn-emoji">{snd.emoji}</span>
                <span className="soundboard-btn-label">{snd.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
