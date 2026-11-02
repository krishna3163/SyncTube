export type RoomExperienceMode = 'party' | 'cinema' | 'study';

export interface StudyNote {
  id: string;
  videoId: string;
  videoTitle: string;
  timestampSeconds: number;
  timestampFormatted: string;
  text: string;
  createdAt: number;
  tag?: 'concept' | 'doubt' | 'formula' | 'general' | 'other';
  customTag?: string;
  screenshotDataUrl?: string;
}

export interface CapturedSlide {
  id: string;
  timestampSeconds: number;
  timestampFormatted: string;
  videoTitle: string;
  dataUrl: string;
  createdAt: number;
  noteText?: string;
}

export interface StudyTodo {
  id: string;
  text: string;
  completed: boolean;
  createdAt: number;
}

export interface StudyRule {
  id: string;
  title: string;
  description: string;
  enabled: boolean;
  triggerType:
    | 'playback_duration'
    | 'time_interval'
    | 'video_ended'
    | 'pomodoro_end'
    | 'countdown'
    | 'clock_time'
    | 'calendar_datetime'
    | 'video_timestamp';
  intervalMinutes?: number;
  countdownMinutes?: number;
  targetTimestampMs?: number; // target wall-clock time for countdown / calendar
  clockTime?: string; // e.g. "20:30" (HH:MM in 24h)
  targetVideoTimestamp?: number; // timestamp in seconds in video
  targetVideoTitle?: string;
  actionMessage: string;
  autoPauseVideo?: boolean;
  lastTriggered?: number;
  isCustom?: boolean;
  createdAt?: number;
}

export interface StudyPlan {
  dailyGoal: string;
  targetVideosCount: number;
  completedVideosCount: number;
  pomodoroMinutes: number;
  breakMinutes: number;
}
