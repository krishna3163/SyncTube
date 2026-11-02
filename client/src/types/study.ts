export type RoomExperienceMode = 'party' | 'cinema' | 'study';

export interface StudyNote {
  id: string;
  videoId: string;
  videoTitle: string;
  timestampSeconds: number;
  timestampFormatted: string;
  text: string;
  createdAt: number;
  tag?: 'concept' | 'doubt' | 'formula' | 'general';
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
  triggerType: 'playback_duration' | 'time_interval' | 'video_ended' | 'pomodoro_end';
  intervalMinutes?: number;
  actionMessage: string;
  autoPauseVideo?: boolean;
  lastTriggered?: number;
}

export interface StudyPlan {
  dailyGoal: string;
  targetVideosCount: number;
  completedVideosCount: number;
  pomodoroMinutes: number;
  breakMinutes: number;
}
