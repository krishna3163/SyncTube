import React, { useState, useEffect, useRef } from 'react';
import {
  Clock,
  Play,
  Pause,
  RotateCcw,
  Coffee,
  BookOpen,
  Copy,
  Check,
  SlidersHorizontal,
  ChevronDown,
  X,
} from 'lucide-react';

interface StudyHeaderClockProps {
  roomId: string;
  onCopyRoomCode: () => void;
  copiedCode: boolean;
  onPomodoroEnd?: (mode: 'focus' | 'break') => void;
}

const FOCUS_PRESETS = [15, 25, 30, 45, 60];

export const StudyHeaderClock: React.FC<StudyHeaderClockProps> = ({
  roomId,
  onCopyRoomCode,
  copiedCode,
  onPomodoroEnd,
}) => {
  // 1. 12-Hour vs 24-Hour Real-Time Clock
  const [is12Hour, setIs12Hour] = useState<boolean>(() => {
    try {
      return localStorage.getItem('synctube_clock_12h') === 'true';
    } catch {
      return false;
    }
  });

  const getFormattedTime = (use12h: boolean) => {
    return new Date().toLocaleTimeString([], {
      hour12: use12h,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  const [timeStr, setTimeStr] = useState<string>(() => getFormattedTime(is12Hour));

  useEffect(() => {
    const timer = setInterval(() => {
      setTimeStr(getFormattedTime(is12Hour));
    }, 1000);
    return () => clearInterval(timer);
  }, [is12Hour]);

  const toggleClockFormat = () => {
    setIs12Hour((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('synctube_clock_12h', String(next));
      } catch {}
      setTimeStr(getFormattedTime(next));
      return next;
    });
  };

  // 2. Configurable Pomodoro Focus Timer
  const [focusMinutes, setFocusMinutes] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('synctube_focus_minutes');
      return saved ? parseInt(saved, 10) : 25;
    } catch {
      return 25;
    }
  });

  const [breakMinutes, setBreakMinutes] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('synctube_break_minutes');
      return saved ? parseInt(saved, 10) : 5;
    } catch {
      return 5;
    }
  });

  const [isConfigOpen, setIsConfigOpen] = useState<boolean>(false);
  const [customInputMins, setCustomInputMins] = useState<string>(String(focusMinutes));
  const configRef = useRef<HTMLDivElement>(null);

  const [pomoMode, setPomoMode] = useState<'focus' | 'break'>('focus');
  const [timeLeft, setTimeLeft] = useState<number>(() => focusMinutes * 60);
  const [cycleDuration, setCycleDuration] = useState<number>(() => focusMinutes * 60);
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [isProgressOpen, setIsProgressOpen] = useState<boolean>(false);
  const [extensionMinutes, setExtensionMinutes] = useState('10');

  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      if (configRef.current && !configRef.current.contains(e.target as Node)) {
        setIsConfigOpen(false);
      }
    };
    if (isConfigOpen || isProgressOpen) {
      document.addEventListener('mousedown', handleOutside);
    }
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [isConfigOpen, isProgressOpen]);

  useEffect(() => {
    let interval: any = null;
    if (isRunning && timeLeft > 0) {
      interval = setInterval(() => {
        setTimeLeft((prev) => prev - 1);
      }, 1000);
    } else if (isRunning && timeLeft === 0) {
      setIsRunning(false);
      const nextMode = pomoMode === 'focus' ? 'break' : 'focus';
      const nextDuration = (nextMode === 'focus' ? focusMinutes : breakMinutes) * 60;
      setPomoMode(nextMode);
      setCycleDuration(nextDuration);
      setTimeLeft(nextDuration);
      if (onPomodoroEnd) {
        onPomodoroEnd(pomoMode);
      }
    }
    return () => clearInterval(interval);
  }, [isRunning, timeLeft, pomoMode, focusMinutes, breakMinutes, onPomodoroEnd]);

  const toggleTimer = () => setIsRunning(!isRunning);

  const resetTimer = () => {
    setIsRunning(false);
    const duration = (pomoMode === 'focus' ? focusMinutes : breakMinutes) * 60;
    setCycleDuration(duration);
    setTimeLeft(duration);
  };

  const handleSelectFocusPreset = (mins: number) => {
    setFocusMinutes(mins);
    setCustomInputMins(String(mins));
    try {
      localStorage.setItem('synctube_focus_minutes', String(mins));
    } catch {}
    if (pomoMode === 'focus') {
      setIsRunning(false);
      setCycleDuration(mins * 60);
      setTimeLeft(mins * 60);
    }
    setIsConfigOpen(false);
  };

  const handleApplyCustomMins = (e: React.FormEvent) => {
    e.preventDefault();
    const val = parseInt(customInputMins, 10);
    if (!isNaN(val) && val >= 1 && val <= 180) {
      handleSelectFocusPreset(val);
    }
  };

  const formatPomoTime = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const addTimerMinutes = (mins: number) => {
    if (!Number.isFinite(mins) || mins < 1 || mins > 180) return;
    setTimeLeft((time) => time + mins * 60);
    setCycleDuration((duration) => duration + mins * 60);
  };

  const remainingPercent = Math.min(100, Math.max(0, (timeLeft / cycleDuration) * 100));
  const remainingColor = remainingPercent <= 20 ? 'pomo-low-time' : remainingPercent <= 50 ? 'pomo-mid-time' : '';

  return (
    <div className="study-header-clock-container" title="Study Mode Focus Bar">
      {/* 1. Real-time Clock with 12h/24h Click Toggle */}
      <div
        className="study-live-clock clickable"
        onClick={toggleClockFormat}
        title={`Click to switch between 12-hour and 24-hour clock. (Currently: ${is12Hour ? '12h AM/PM' : '24h'})`}
      >
        <Clock size={13} className="text-amber-400" />
        <span className="live-clock-time">{timeStr}</span>
      </div>

      <div className="study-clock-divider" />

      {/* 2. Pomodoro Focus Timer with Changeable Focus Duration */}
      <div className="study-pomo-wrapper" ref={configRef}>
        <div className={`study-pomo-badge ${pomoMode === 'focus' ? 'pomo-focus' : 'pomo-break'} ${pomoMode === 'focus' ? remainingColor : ''}`}>
          {pomoMode === 'focus' ? (
            <BookOpen size={12} className="text-emerald-400" />
          ) : (
            <Coffee size={12} className="text-amber-300" />
          )}

          {/* Clickable Focus label to change duration */}
          <button
            type="button"
            className="pomo-duration-edit-btn"
            onClick={() => {
              setIsProgressOpen(false);
              setIsConfigOpen((prev) => !prev);
            }}
            title={`Focus time is ${focusMinutes}m. Click to change focus duration.`}
          >
            <span className="pomo-label">{pomoMode === 'focus' ? 'Focus' : 'Break'}:</span>
            <ChevronDown size={10} className="pomo-arrow-icon" />
          </button>

          <button
            type="button"
            className="pomo-time pomo-progress-toggle"
            onClick={() => {
              setIsConfigOpen(false);
              setIsProgressOpen((prev) => !prev);
            }}
            aria-expanded={isProgressOpen}
            aria-label={`Show ${pomoMode} timer progress`}
          >
            {formatPomoTime(timeLeft)}
          </button>

          <button
            type="button"
            className="pomo-control-btn"
            onClick={toggleTimer}
            title={isRunning ? 'Pause Focus Sprint' : 'Start Focus Sprint'}
            aria-label={isRunning ? 'Pause' : 'Start'}
          >
            {isRunning ? <Pause size={11} /> : <Play size={11} />}
          </button>

          <button
            type="button"
            className="pomo-control-btn"
            onClick={resetTimer}
            title="Reset to start of sprint"
            aria-label="Reset"
          >
            <RotateCcw size={11} />
          </button>
        </div>

        {isProgressOpen && (
          <div className="pomo-progress-popover animate-scale-in">
            <div className="pomo-progress-heading">
              <span>{pomoMode === 'focus' ? 'Focus progress' : 'Break progress'}</span>
              <strong>{Math.round(100 - remainingPercent)}% complete</strong>
            </div>
            <div
              className={`pomo-progress-track ${pomoMode === 'focus' ? remainingColor : 'pomo-break-progress'}`}
              role="progressbar"
              aria-label={`${pomoMode} timer progress`}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(100 - remainingPercent)}
            >
              <span style={{ width: `${100 - remainingPercent}%` }} />
            </div>
            <div className="pomo-add-time-row">
              <button type="button" className="preset-btn" onClick={() => addTimerMinutes(5)}>
                +5 min
              </button>
              <form
                className="pomo-input-row"
                onSubmit={(e) => {
                  e.preventDefault();
                  const minutes = Number(extensionMinutes);
                  if (Number.isInteger(minutes) && minutes >= 1 && minutes <= 180) {
                    addTimerMinutes(minutes);
                    setExtensionMinutes('10');
                  }
                }}
              >
                <input
                  type="number"
                  min="1"
                  max="180"
                  step="1"
                  required
                  value={extensionMinutes}
                  onChange={(e) => setExtensionMinutes(e.target.value)}
                  aria-label="Minutes to add"
                />
                <button type="submit" className="btn-apply-mins">Add min</button>
              </form>
            </div>
          </div>
        )}

        {/* Changeable Focus Duration Popover */}
        {isConfigOpen && (
          <div className="pomo-config-popover animate-scale-in">
            <div className="pomo-config-header">
              <SlidersHorizontal size={12} className="text-amber-400" />
              <span>Change Focus Duration</span>
              <button
                type="button"
                className="btn-close-popover"
                onClick={() => setIsConfigOpen(false)}
              >
                <X size={12} />
              </button>
            </div>

            <div className="pomo-presets-row">
              {FOCUS_PRESETS.map((mins) => (
                <button
                  key={mins}
                  type="button"
                  className={`preset-btn ${focusMinutes === mins ? 'active' : ''}`}
                  onClick={() => handleSelectFocusPreset(mins)}
                >
                  {mins}m
                </button>
              ))}
            </div>

            <form onSubmit={handleApplyCustomMins} className="pomo-custom-form">
              <label htmlFor="custom-focus-mins">Custom (mins):</label>
              <div className="pomo-input-row">
                <input
                  id="custom-focus-mins"
                  type="number"
                  min="1"
                  max="180"
                  value={customInputMins}
                  onChange={(e) => setCustomInputMins(e.target.value)}
                  placeholder="25"
                />
                <button type="submit" className="btn-apply-mins">
                  Set
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  );
};
