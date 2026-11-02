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
  const [isRunning, setIsRunning] = useState<boolean>(false);

  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      if (configRef.current && !configRef.current.contains(e.target as Node)) {
        setIsConfigOpen(false);
      }
    };
    if (isConfigOpen) {
      document.addEventListener('mousedown', handleOutside);
    }
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [isConfigOpen]);

  useEffect(() => {
    let interval: any = null;
    if (isRunning && timeLeft > 0) {
      interval = setInterval(() => {
        setTimeLeft((prev) => prev - 1);
      }, 1000);
    } else if (isRunning && timeLeft === 0) {
      setIsRunning(false);
      const nextMode = pomoMode === 'focus' ? 'break' : 'focus';
      setPomoMode(nextMode);
      setTimeLeft(nextMode === 'focus' ? focusMinutes * 60 : breakMinutes * 60);
      if (onPomodoroEnd) {
        onPomodoroEnd(pomoMode);
      }
    }
    return () => clearInterval(interval);
  }, [isRunning, timeLeft, pomoMode, focusMinutes, breakMinutes, onPomodoroEnd]);

  const toggleTimer = () => setIsRunning(!isRunning);

  const resetTimer = () => {
    setIsRunning(false);
    setTimeLeft(pomoMode === 'focus' ? focusMinutes * 60 : breakMinutes * 60);
  };

  const handleSelectFocusPreset = (mins: number) => {
    setFocusMinutes(mins);
    setCustomInputMins(String(mins));
    try {
      localStorage.setItem('synctube_focus_minutes', String(mins));
    } catch {}
    if (pomoMode === 'focus') {
      setIsRunning(false);
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
        <span className="clock-format-pill">{is12Hour ? '12h' : '24h'}</span>
      </div>

      <div className="study-clock-divider" />

      {/* 2. Pomodoro Focus Timer with Changeable Focus Duration */}
      <div className="study-pomo-wrapper" ref={configRef}>
        <div className={`study-pomo-badge ${pomoMode === 'focus' ? 'pomo-focus' : 'pomo-break'}`}>
          {pomoMode === 'focus' ? (
            <BookOpen size={12} className="text-emerald-400" />
          ) : (
            <Coffee size={12} className="text-amber-300" />
          )}

          {/* Clickable Focus label to change duration */}
          <button
            type="button"
            className="pomo-duration-edit-btn"
            onClick={() => setIsConfigOpen((prev) => !prev)}
            title={`Focus time is ${focusMinutes}m. Click to change focus duration.`}
          >
            <span className="pomo-label">{pomoMode === 'focus' ? 'Focus' : 'Break'}:</span>
            <ChevronDown size={10} className="pomo-arrow-icon" />
          </button>

          <span className="pomo-time">{formatPomoTime(timeLeft)}</span>

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
