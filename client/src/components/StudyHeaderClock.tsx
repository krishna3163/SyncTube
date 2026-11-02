import React, { useState, useEffect } from 'react';
import { Clock, Play, Pause, RotateCcw, Coffee, BookOpen, Copy, Check } from 'lucide-react';

interface StudyHeaderClockProps {
  roomId: string;
  onCopyRoomCode: () => void;
  copiedCode: boolean;
  onPomodoroEnd?: (mode: 'focus' | 'break') => void;
}

export const StudyHeaderClock: React.FC<StudyHeaderClockProps> = ({
  roomId,
  onCopyRoomCode,
  copiedCode,
  onPomodoroEnd,
}) => {
  // 1. Real-time Clock (HH:MM:SS)
  const [timeStr, setTimeStr] = useState<string>(() =>
    new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  );

  useEffect(() => {
    const timer = setInterval(() => {
      setTimeStr(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // 2. Pomodoro Focus Timer State
  const FOCUS_SECONDS = 25 * 60;
  const BREAK_SECONDS = 5 * 60;

  const [pomoMode, setPomoMode] = useState<'focus' | 'break'>('focus');
  const [timeLeft, setTimeLeft] = useState<number>(FOCUS_SECONDS);
  const [isRunning, setIsRunning] = useState<boolean>(false);

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
      setTimeLeft(nextMode === 'focus' ? FOCUS_SECONDS : BREAK_SECONDS);
      if (onPomodoroEnd) {
        onPomodoroEnd(pomoMode);
      }
    }
    return () => clearInterval(interval);
  }, [isRunning, timeLeft, pomoMode, onPomodoroEnd]);

  const toggleTimer = () => setIsRunning(!isRunning);

  const resetTimer = () => {
    setIsRunning(false);
    setTimeLeft(pomoMode === 'focus' ? FOCUS_SECONDS : BREAK_SECONDS);
  };

  const formatPomoTime = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`;
  };

  return (
    <div className="study-header-clock-container" title="Study Mode Focus Bar">
      {/* Real-time Clock */}
      <div className="study-live-clock">
        <Clock size={13} className="text-amber-400" />
        <span className="live-clock-time">{timeStr}</span>
      </div>

      <div className="study-clock-divider" />

      {/* Pomodoro Focus Timer */}
      <div className={`study-pomo-badge ${pomoMode === 'focus' ? 'pomo-focus' : 'pomo-break'}`}>
        {pomoMode === 'focus' ? (
          <BookOpen size={12} className="text-emerald-400" />
        ) : (
          <Coffee size={12} className="text-amber-300" />
        )}
        <span className="pomo-label">{pomoMode === 'focus' ? 'Focus' : 'Break'}:</span>
        <span className="pomo-time">{formatPomoTime(timeLeft)}</span>

        <button
          type="button"
          className="pomo-control-btn"
          onClick={toggleTimer}
          title={isRunning ? 'Pause Pomodoro' : 'Start Pomodoro'}
          aria-label={isRunning ? 'Pause' : 'Start'}
        >
          {isRunning ? <Pause size={11} /> : <Play size={11} />}
        </button>

        <button
          type="button"
          className="pomo-control-btn"
          onClick={resetTimer}
          title="Reset Pomodoro"
          aria-label="Reset"
        >
          <RotateCcw size={11} />
        </button>
      </div>

      <div className="study-clock-divider" />

      {/* Compact Room Code Copy Button */}
      <button
        type="button"
        className={`study-room-code-chip ${copiedCode ? 'copied' : ''}`}
        onClick={onCopyRoomCode}
        title="Copy room code"
        aria-label={`Copy room code ${roomId}`}
      >
        <span>{roomId}</span>
        {copiedCode ? <Check size={11} className="text-emerald-400" /> : <Copy size={11} />}
      </button>
    </div>
  );
};

