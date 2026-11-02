import React, { useState, useEffect, useRef } from 'react';
import {
  BookOpen,
  CheckSquare,
  Calendar,
  FileText,
  Sparkles,
  Download,
  Plus,
  Trash2,
  Clock,
  Check,
  Upload,
  ExternalLink,
  Zap,
  Play,
  RotateCcw,
  Copy,
  Tag,
  AlertCircle,
  Bell,
  Coffee,
  Droplet,
  Camera,
  Pencil,
  FileDown,
  X,
  ListMusic,
  Search,
} from 'lucide-react';
import { jsPDF } from 'jspdf';
import { StudyNote, StudyTodo, StudyRule, StudyPlan, CapturedSlide } from '../types/study.js';
import {
  Role,
  PlayState,
  PlaylistItem,
  ChatMessage,
  ParticipantPublic,
  RoomPoll,
  ActivityItem,
  RoomSettingsData,
  ActionRequestType,
} from '../types.js';
import { formatTime } from '../utils/youtube.js';
import { SyncAI } from './SyncAI.js';
import { Playlist } from './Playlist.js';
import { YouTubeSearchModal } from './YouTubeSearchModal.js';

export interface StudySuiteProps {
  roomId: string;
  roomName?: string;
  roomSettings?: RoomSettingsData;
  currentUserId?: string;
  currentUsername?: string;
  currentUserRole?: Role;
  currentUserAvatarId?: string;
  participants?: ParticipantPublic[];
  currentVideoId?: string;
  currentVideoTitle?: string;
  currentPlaybackTime: number;
  duration?: number;
  playState?: PlayState;
  playbackSpeed?: number;
  volume?: number;
  isMuted?: boolean;
  playlist?: PlaylistItem[];
  watchHistory?: { videoId: string; title: string; timestamp: number }[];
  chatMessages?: ChatMessage[];
  activePoll?: RoomPoll | null;
  recentActivities?: ActivityItem[];
  onPlay?: () => void;
  onPause?: () => void;
  onSeek: (seconds: number) => void;
  onSetPlaybackSpeed?: (speed: number) => void;
  onSetVolume?: (volume: number) => void;
  onToggleMute?: () => void;
  onPlayVideo: (videoId: string, title?: string) => void;
  onNextVideo?: () => void;
  onAddToPlaylist: (
    videoId: string,
    title?: string,
    duration?: string,
    channel?: string,
    thumbnail?: string
  ) => void;
  onMoveToTop: (itemId: string) => void;
  onShufflePlaylist?: () => void;
  onClearPlaylist?: () => void;
  onImportPlaylist: (url: string) => Promise<void> | void;
  onPlayPlaylistItem: (videoId: string, itemId: string) => void;
  onRemovePlaylistItem: (itemId: string) => void;
  onReorderPlaylist: (fromIndex: number, toIndex: number) => void;
  onVotePlaylistItem: (itemId: string) => void;
  onRequestAction: (
    type: ActionRequestType,
    data?: { time?: number; videoId?: string; title?: string; duration?: string; channel?: string }
  ) => void;
  onAddPlaylistBatch: (items: {
    videoId: string;
    title?: string;
    duration?: string;
    channel?: string;
    thumbnail?: string;
  }[]) => void;
  onSendMessage?: (text: string) => void;
  onNotify: (msg: string, type: 'success' | 'error' | 'info') => void;
}

type StudyTab = 'notes' | 'tasks' | 'planner' | 'docs' | 'ai' | 'playlist' | 'search';

const DEFAULT_RULES: StudyRule[] = [
  {
    id: 'rule-pomodoro',
    title: '25-Min Focus Break',
    description: 'Remind to take a 5-minute break and rest your eyes after 25 mins of video study.',
    enabled: true,
    triggerType: 'playback_duration',
    intervalMinutes: 25,
    actionMessage: '☕ Time for a 5-minute Pomodoro break! Stretch and rest your eyes.',
    autoPauseVideo: true,
  },
  {
    id: 'rule-hydration',
    title: 'Stay Hydrated',
    description: 'Alert every 45 minutes to drink water while studying.',
    enabled: true,
    triggerType: 'time_interval',
    intervalMinutes: 45,
    actionMessage: '💧 Drink some water! Keep your brain hydrated and focused.',
  },
  {
    id: 'rule-video-end',
    title: 'Lecture End Summary',
    description: 'When a lecture video finishes, prompt to write a 2-line summary in your notes.',
    enabled: true,
    triggerType: 'video_ended',
    actionMessage: '📝 Lecture completed! Write down your top 2 takeaways in your notes.',
  },
];

export const StudySuite: React.FC<StudySuiteProps> = ({
  roomId,
  roomName,
  roomSettings = {
    name: 'SyncTube Cinema',
    theme: 'midnight',
    accentColor: '#ffd21f',
    permissions: {
      add: { viewer: true, moderator: true, owner: true },
      remove: { viewer: false, moderator: true, owner: true },
      move: { viewer: false, moderator: true, owner: true },
      playPause: { viewer: true, moderator: true, owner: true },
      seek: { viewer: true, moderator: true, owner: true },
      skip: { viewer: false, moderator: true, owner: true },
      chatSend: { viewer: true, moderator: true, owner: true },
      chatDelete: { viewer: false, moderator: true, owner: true },
      ban: { viewer: false, moderator: true, owner: true },
    },
    autoRemovePlayed: false,
    shuffle: false,
    allowLinks: true,
    allowEmbeddedLinks: true,
  },
  currentUserId = 'anonymous',
  currentUsername = 'Guest',
  currentUserRole = 'PARTICIPANT',
  currentUserAvatarId,
  participants = [],
  currentVideoId,
  currentVideoTitle,
  currentPlaybackTime,
  duration = 0,
  playState = 'paused',
  playbackSpeed = 1,
  volume = 100,
  isMuted = false,
  playlist = [],
  watchHistory = [],
  chatMessages = [],
  activePoll = null,
  recentActivities = [],
  onPlay,
  onPause,
  onSeek,
  onSetPlaybackSpeed,
  onSetVolume,
  onToggleMute,
  onPlayVideo,
  onNextVideo,
  onAddToPlaylist,
  onMoveToTop,
  onShufflePlaylist,
  onClearPlaylist,
  onImportPlaylist,
  onPlayPlaylistItem,
  onRemovePlaylistItem,
  onReorderPlaylist,
  onVotePlaylistItem,
  onRequestAction,
  onAddPlaylistBatch,
  onSendMessage,
  onNotify,
}) => {
  const [activeTab, setActiveTab] = useState<StudyTab>('notes');

  // 1. NOTES STATE & LOCAL STORAGE PERSISTENCE
  const storageNotesKey = `synctube_notes_${roomId}`;
  const [notes, setNotes] = useState<StudyNote[]>(() => {
    try {
      const saved = localStorage.getItem(storageNotesKey);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [noteInput, setNoteInput] = useState<string>('');
  const [noteTag, setNoteTag] = useState<NonNullable<StudyNote['tag']>>('concept');
  const [customNoteTag, setCustomNoteTag] = useState('');

  useEffect(() => {
    try {
      localStorage.setItem(storageNotesKey, JSON.stringify(notes));
    } catch {}
  }, [notes, storageNotesKey]);

  // 2. TODOS / TASKS STATE
  const storageTasksKey = `synctube_tasks_${roomId}`;
  const [tasks, setTasks] = useState<StudyTodo[]>(() => {
    try {
      const saved = localStorage.getItem(storageTasksKey);
      return saved
        ? JSON.parse(saved)
        : [
            { id: '1', text: 'Review core lecture concepts & diagrams', completed: false, createdAt: Date.now() },
            { id: '2', text: 'Solve practice problems after video', completed: false, createdAt: Date.now() },
          ];
    } catch {
      return [];
    }
  });
  const [taskInput, setTaskInput] = useState<string>('');

  useEffect(() => {
    try {
      localStorage.setItem(storageTasksKey, JSON.stringify(tasks));
    } catch {}
  }, [tasks, storageTasksKey]);

  // 3. CAPTURED SLIDES / SCREENSHOTS STATE
  const storageSlidesKey = `synctube_slides_${roomId}`;
  const [capturedSlides, setCapturedSlides] = useState<CapturedSlide[]>(() => {
    try {
      const saved = localStorage.getItem(storageSlidesKey);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(storageSlidesKey, JSON.stringify(capturedSlides));
    } catch {}
  }, [capturedSlides, storageSlidesKey]);

  // 4. INLINE EDITING STATES (Notes & Tasks)
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editingNoteText, setEditingNoteText] = useState<string>('');
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [editingTaskText, setEditingTaskText] = useState<string>('');

  // 5. EMBEDDED STUDY AI PROMPT STATE
  const [aiInitialPrompt, setAiInitialPrompt] = useState<string>('');

  // 6. AUTOMATION RULES STATE
  const storageRulesKey = `synctube_rules_${roomId}`;
  const [rules, setRules] = useState<StudyRule[]>(() => {
    try {
      const saved = localStorage.getItem(storageRulesKey);
      return saved ? JSON.parse(saved) : DEFAULT_RULES;
    } catch {
      return DEFAULT_RULES;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(storageRulesKey, JSON.stringify(rules));
    } catch {}
  }, [rules, storageRulesKey]);

  // Custom Rule Creator State
  const [isCreatingRule, setIsCreatingRule] = useState(false);
  const [newRuleTitle, setNewRuleTitle] = useState('');
  const [newRuleType, setNewRuleType] = useState<StudyRule['triggerType']>('countdown');
  const [newCountdownMins, setNewCountdownMins] = useState(5);
  const [newClockTime, setNewClockTime] = useState('20:30');
  const [newCalendarDateTime, setNewCalendarDateTime] = useState('');
  const [newVideoTimestamp, setNewVideoTimestamp] = useState(0);
  const [newActionMsg, setNewActionMsg] = useState('Khana khane jana hai!');
  const [newAutoPause, setNewAutoPause] = useState(true);

  // Active Rule Evaluator Loop (fires countdowns, exact clock times, video timestamps)
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      const nowDate = new Date();
      const currentClockHHMM = nowDate.toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit' });

      setRules((prevRules) => {
        let changed = false;
        const updated = prevRules.map((rule) => {
          if (!rule.enabled) return rule;

          // Check if already fired recently (within last 45s)
          if (rule.lastTriggered && now - rule.lastTriggered < 45000) {
            return rule;
          }

          let shouldFire = false;

          // 1. Countdown timer (e.g. 5 min bad khana khane jana hai)
          if (rule.triggerType === 'countdown' && rule.targetTimestampMs) {
            if (now >= rule.targetTimestampMs) {
              shouldFire = true;
            }
          }

          // 2. Exact Clock Time (e.g. at 20:30)
          if (rule.triggerType === 'clock_time' && rule.clockTime) {
            if (currentClockHHMM === rule.clockTime) {
              shouldFire = true;
            }
          }

          // 3. Calendar Date-Time
          if (rule.triggerType === 'calendar_datetime' && rule.targetTimestampMs) {
            if (now >= rule.targetTimestampMs) {
              shouldFire = true;
            }
          }

          // 4. Video Timestamp (e.g. at 05:30 in lecture)
          if (rule.triggerType === 'video_timestamp' && rule.targetVideoTimestamp !== undefined) {
            if (Math.abs(currentPlaybackTime - rule.targetVideoTimestamp) < 1.5) {
              shouldFire = true;
            }
          }

          if (shouldFire) {
            changed = true;
            onNotify(`🔔 [${rule.title}] ${rule.actionMessage}`, 'info');
            if (rule.autoPauseVideo && onPause) {
              onPause();
            }
            return {
              ...rule,
              lastTriggered: now,
              enabled: rule.triggerType === 'countdown' || rule.triggerType === 'calendar_datetime' ? false : rule.enabled,
            };
          }

          return rule;
        });

        return changed ? updated : prevRules;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [currentPlaybackTime, onPause, onNotify]);

  const handleCreateRule = (e: React.FormEvent) => {
    e.preventDefault();
    const title = newRuleTitle.trim();
    if (!title) {
      onNotify('Please enter a rule title', 'error');
      return;
    }

    const now = Date.now();
    let targetTimestampMs: number | undefined = undefined;
    let desc = '';

    if (newRuleType === 'countdown') {
      const mins = Math.max(1, newCountdownMins || 5);
      targetTimestampMs = now + mins * 60 * 1000;
      desc = `Remind in ${mins} minute(s) (${new Date(targetTimestampMs).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})`;
    } else if (newRuleType === 'clock_time') {
      if (!newClockTime) {
        onNotify('Please specify an exact clock time (HH:MM)', 'error');
        return;
      }
      desc = `Trigger alert every day at ${newClockTime}`;
    } else if (newRuleType === 'calendar_datetime') {
      if (!newCalendarDateTime) {
        onNotify('Please select date & time', 'error');
        return;
      }
      const parsed = new Date(newCalendarDateTime).getTime();
      if (isNaN(parsed)) {
        onNotify('Invalid date/time', 'error');
        return;
      }
      targetTimestampMs = parsed;
      desc = `Alert scheduled for ${new Date(parsed).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}`;
    } else if (newRuleType === 'video_timestamp') {
      const ts = Math.max(0, newVideoTimestamp);
      desc = `Trigger when video reaches ${formatTime(ts)} (${currentVideoTitle || 'Current Video'})`;
    }

    const rule: StudyRule = {
      id: `custom-rule-${Date.now()}`,
      title,
      description: desc,
      enabled: true,
      triggerType: newRuleType,
      countdownMinutes: newRuleType === 'countdown' ? newCountdownMins : undefined,
      targetTimestampMs,
      clockTime: newRuleType === 'clock_time' ? newClockTime : undefined,
      targetVideoTimestamp: newRuleType === 'video_timestamp' ? newVideoTimestamp : undefined,
      targetVideoTitle: currentVideoTitle,
      actionMessage: newActionMsg.trim() || 'Reminder alert triggered!',
      autoPauseVideo: newAutoPause,
      isCustom: true,
      createdAt: now,
    };

    setRules((prev) => [rule, ...prev]);
    setIsCreatingRule(false);
    setNewRuleTitle('');
    setNewActionMsg('Khana khane jana hai!');
    onNotify(`🎯 Smart Automation Rule "${title}" activated!`, 'success');
  };

  const handleDeleteRule = (id: string) => {
    setRules((prev) => prev.filter((r) => r.id !== id));
    onNotify('Rule removed', 'info');
  };

  // 4. CUSTOM PDF & CHEAT SHEET STATE
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [pdfFileName, setPdfFileName] = useState<string>('');
  const [customCheatSheet, setCustomCheatSheet] = useState<string>(() => {
    return localStorage.getItem(`synctube_cheatsheet_${roomId}`) ||
`# Quick Revision Formulas & Notes
• Concept 1: Key definition or theorem
• Formula: E = mc² or Big-O Complexity: O(n log n)
• Important Exam Doubts to Ask Professor`;
  });

  useEffect(() => {
    try {
      localStorage.setItem(`synctube_cheatsheet_${roomId}`, customCheatSheet);
    } catch {}
  }, [customCheatSheet, roomId]);

  // Handlers for Notes
  const handleAddNote = () => {
    const text = noteInput.trim();
    if (!text) return;
    const customTag = customNoteTag.trim();
    if (noteTag === 'other' && !customTag) {
      onNotify('Enter a label for the Other note tag.', 'error');
      return;
    }

    const newNote: StudyNote = {
      id: `note-${Date.now()}`,
      videoId: currentVideoId || 'general',
      videoTitle: currentVideoTitle || 'Lecture Video',
      timestampSeconds: Math.floor(currentPlaybackTime),
      timestampFormatted: formatTime(currentPlaybackTime),
      text,
      createdAt: Date.now(),
      tag: noteTag,
      customTag: noteTag === 'other' ? customTag : undefined,
    };

    setNotes((prev) => [newNote, ...prev]);
    setNoteInput('');
    setCustomNoteTag('');
    onNotify(`📝 Note saved at [${newNote.timestampFormatted}]!`, 'success');
  };

  const handleDeleteNote = (id: string) => {
    setNotes((prev) => prev.filter((n) => n.id !== id));
  };

  // Export & Download Notes
  const handleExportNotes = () => {
    if (notes.length === 0 && tasks.length === 0) {
      onNotify('No notes or tasks to export yet! Add some notes first.', 'info');
      return;
    }

    const dateStr = new Date().toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

    let content = `# SyncTube Study Session Notes\n\n`;
    content += `**Room:** ${roomName || roomId}\n`;
    content += `**Date:** ${dateStr}\n\n`;

    if (notes.length > 0) {
      content += `## 📝 Timestamped Lecture Notes\n\n`;
      notes.forEach((n, idx) => {
        content += `### ${idx + 1}. [${n.timestampFormatted}] ${n.videoTitle} (${n.customTag || n.tag?.toUpperCase() || 'NOTE'})\n`;
        content += `${n.text}\n\n`;
      });
    }

    if (tasks.length > 0) {
      content += `## ✅ Study Tasks Checklist\n\n`;
      tasks.forEach((t) => {
        content += `- [${t.completed ? 'x' : ' '}] ${t.text}\n`;
      });
      content += `\n`;
    }

    if (customCheatSheet.trim()) {
      content += `## 📄 Custom Cheat Sheet / Reference\n\n`;
      content += `${customCheatSheet}\n\n`;
    }

    const blob = new Blob([content], { type: 'text/markdown;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `SyncTube_Study_Notes_${roomId}_${Date.now()}.md`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    onNotify('📥 Study notes downloaded as Markdown file!', 'success');
  };

  const handleCopyNotes = () => {
    if (notes.length === 0) {
      onNotify('No notes to copy.', 'info');
      return;
    }
    const text = notes
      .map((n) => `[${n.timestampFormatted}] ${n.videoTitle} (${n.customTag || n.tag?.toUpperCase()}):\n${n.text}\n`)
      .join('\n');
    navigator.clipboard.writeText(text);
    onNotify('📋 Copied all notes to clipboard!', 'success');
  };

  // Handlers for Tasks
  const handleAddTask = () => {
    const text = taskInput.trim();
    if (!text) return;
    setTasks((prev) => [...prev, { id: `task-${Date.now()}`, text, completed: false, createdAt: Date.now() }]);
    setTaskInput('');
  };

  const handleToggleTask = (id: string) => {
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, completed: !t.completed } : t)));
  };

  const handleDeleteTask = (id: string) => {
    setTasks((prev) => prev.filter((t) => t.id !== id));
  };

  // PDF Upload Handler
  const handlePdfUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && file.type === 'application/pdf') {
      const url = URL.createObjectURL(file);
      setPdfUrl(url);
      setPdfFileName(file.name);
      onNotify(`📄 Loaded PDF: ${file.name}`, 'success');
    } else if (file) {
      onNotify('Please select a valid PDF document.', 'error');
    }
  };

  // Handlers for Note Editing
  const handleStartEditNote = (note: StudyNote) => {
    setEditingNoteId(note.id);
    setEditingNoteText(note.text);
  };

  const handleSaveEditNote = (id: string) => {
    if (!editingNoteText.trim()) return;
    setNotes((prev) =>
      prev.map((n) => (n.id === id ? { ...n, text: editingNoteText.trim() } : n))
    );
    setEditingNoteId(null);
    onNotify('✏️ Note updated successfully!', 'success');
  };

  const handleCancelEditNote = () => {
    setEditingNoteId(null);
  };

  // Handlers for Task Editing
  const handleStartEditTask = (task: StudyTodo) => {
    setEditingTaskId(task.id);
    setEditingTaskText(task.text);
  };

  const handleSaveEditTask = (id: string) => {
    if (!editingTaskText.trim()) return;
    setTasks((prev) =>
      prev.map((t) => (t.id === id ? { ...t, text: editingTaskText.trim() } : t))
    );
    setEditingTaskId(null);
    onNotify('✏️ Task updated successfully!', 'success');
  };

  const handleCancelEditTask = () => {
    setEditingTaskId(null);
  };

  // Helper to save slide and trigger download
  const saveAndRecordSlide = (dataUrl: string, fileName: string, timestampFormatted: string, currentSeconds: number) => {
    const slideId = `slide-${Date.now()}`;
    const newSlide: CapturedSlide = {
      id: slideId,
      timestampSeconds: currentSeconds,
      timestampFormatted,
      videoTitle: currentVideoTitle || 'Lecture Video',
      dataUrl,
      createdAt: Date.now(),
      noteText: `Lecture slide captured at ${timestampFormatted}`,
    };

    setCapturedSlides((prev) => [...prev, newSlide]);

    // Download PNG immediately
    const link = document.createElement('a');
    link.href = dataUrl;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    // Also record in notes
    setNotes((prev) => [
      {
        id: `note-${Date.now()}`,
        videoId: currentVideoId || 'general',
        videoTitle: currentVideoTitle || 'Lecture Video',
        timestampSeconds: currentSeconds,
        timestampFormatted,
        text: `📸 [Lecture Slide]: Captured at ${timestampFormatted}`,
        createdAt: Date.now(),
        tag: 'formula',
        screenshotDataUrl: dataUrl,
      },
      ...prev,
    ]);

    onNotify(`📸 Saved slide at [${timestampFormatted}]! Added to PDF export queue.`, 'success');
  };

  // Lecture Screenshot Handler (Live frame capture from active video or current tab)
  const handleTakeScreenshot = async () => {
    const timestampFormatted = formatTime(currentPlaybackTime);
    const currentSeconds = Math.floor(currentPlaybackTime);
    const cleanTitle = (currentVideoTitle || 'Lecture_Slide').replace(/[^a-zA-Z0-9_-]/g, '_');
    const fileName = `${cleanTitle}_${timestampFormatted.replace(':', 'm')}s.png`;

    // 1. Try foreground HTML5 <video> elements first (DirectVideoPlayer, RoomTabPlayer, WebRTC)
    const videoElements = Array.from(document.querySelectorAll('video')) as HTMLVideoElement[];
    const activeVideo = videoElements.find((v) => v.videoWidth > 0 && v.readyState >= 2);

    if (activeVideo && activeVideo.videoWidth > 0 && activeVideo.videoHeight > 0) {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = activeVideo.videoWidth;
        canvas.height = activeVideo.videoHeight;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(activeVideo, 0, 0, canvas.width, canvas.height);

          // Watermark timestamp badge
          ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
          ctx.fillRect(canvas.width - 220, canvas.height - 44, 210, 36);
          ctx.font = 'bold 16px sans-serif';
          ctx.fillStyle = '#ffd21f';
          ctx.fillText(`⏱️ ${timestampFormatted}`, canvas.width - 195, canvas.height - 20);

          const dataUrl = canvas.toDataURL('image/png');
          saveAndRecordSlide(dataUrl, fileName, timestampFormatted, currentSeconds);
          return;
        }
      } catch (e) {
        console.warn('Direct video canvas draw failed', e);
      }
    }

    // 2. YouTube / Cross-Origin Iframe: Capture the exact lecture frame via getDisplayMedia
    if (navigator.mediaDevices?.getDisplayMedia) {
      try {
        onNotify('📷 Taking screenshot of playing lecture frame...', 'info');

        const stream = await navigator.mediaDevices.getDisplayMedia({
          video: {
            displaySurface: 'browser',
          },
          // @ts-ignore
          preferCurrentTab: true,
          selfBrowserSurface: 'include',
          surfaceSwitching: 'include',
          systemAudio: 'exclude',
        });

        const track = stream.getVideoTracks()[0];
        const captureVideo = document.createElement('video');
        captureVideo.srcObject = stream;
        captureVideo.muted = true;
        await captureVideo.play();

        // Wait a brief moment for the frame to decode
        await new Promise((res) => setTimeout(res, 140));

        const canvas = document.createElement('canvas');
        const stageEl = (document.querySelector('.stage-card') || document.querySelector('.video-wrapper')) as HTMLElement | null;

        if (stageEl) {
          const rect = stageEl.getBoundingClientRect();
          const scaleX = captureVideo.videoWidth / window.innerWidth;
          const scaleY = captureVideo.videoHeight / window.innerHeight;

          const sx = Math.max(0, rect.left * scaleX);
          const sy = Math.max(0, rect.top * scaleY);
          const sw = Math.min(captureVideo.videoWidth - sx, rect.width * scaleX);
          const sh = Math.min(captureVideo.videoHeight - sy, rect.height * scaleY);

          canvas.width = Math.max(100, sw);
          canvas.height = Math.max(100, sh);
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(captureVideo, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
          }
        } else {
          canvas.width = captureVideo.videoWidth;
          canvas.height = captureVideo.videoHeight;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(captureVideo, 0, 0);
          }
        }

        // Add Watermark Timestamp Badge
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
          ctx.fillRect(canvas.width - 220, canvas.height - 44, 210, 36);
          ctx.font = 'bold 16px sans-serif';
          ctx.fillStyle = '#ffd21f';
          ctx.fillText(`⏱️ ${timestampFormatted}`, canvas.width - 195, canvas.height - 20);
        }

        // Stop all media tracks immediately
        track.stop();
        stream.getTracks().forEach((t) => t.stop());

        const dataUrl = canvas.toDataURL('image/png');
        saveAndRecordSlide(dataUrl, fileName, timestampFormatted, currentSeconds);
        return;
      } catch (err) {
        console.warn('Tab capture was dismissed or not permitted', err);
        onNotify('Screenshot cancelled. Timestamp bookmarked in notes.', 'info');
      }
    }

    // 3. Fallback: Save timestamped bookmark
    setNotes((prev) => [
      {
        id: `note-${Date.now()}`,
        videoId: currentVideoId || 'general',
        videoTitle: currentVideoTitle || 'Lecture Video',
        timestampSeconds: currentSeconds,
        timestampFormatted,
        text: `⏱️ [Lecture Bookmark]: Timestamp ${timestampFormatted}`,
        createdAt: Date.now(),
        tag: 'concept',
      },
      ...prev,
    ]);
    onNotify(`⏱️ Bookmark saved at [${timestampFormatted}] in notes!`, 'info');
  };

  // Export all captured slides into a single organized PDF document
  const handleExportSlidesPdf = () => {
    // Gather all slides from capturedSlides state and notes with screenshotDataUrl
    const slidesToExport: CapturedSlide[] = [...capturedSlides];

    notes.forEach((n) => {
      if (n.screenshotDataUrl && !slidesToExport.some((s) => s.dataUrl === n.screenshotDataUrl)) {
        slidesToExport.push({
          id: n.id,
          timestampSeconds: n.timestampSeconds,
          timestampFormatted: n.timestampFormatted,
          videoTitle: n.videoTitle,
          dataUrl: n.screenshotDataUrl,
          createdAt: n.createdAt,
          noteText: n.text,
        });
      }
    });

    if (slidesToExport.length === 0) {
      onNotify('ℹ️ No lecture slides captured yet. Click "Screenshot" during the lecture to capture slides!', 'info');
      return;
    }

    try {
      // Sort slides chronologically by video timestamp
      const sortedSlides = slidesToExport.sort((a, b) => a.timestampSeconds - b.timestampSeconds);

      // Create Landscape A4 PDF (841.89 x 595.28 pt)
      const pdf = new jsPDF({
        orientation: 'landscape',
        unit: 'pt',
        format: 'a4',
      });

      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();

      // Cover Page
      pdf.setFillColor(11, 15, 23);
      pdf.rect(0, 0, pageWidth, pageHeight, 'F');

      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(26);
      pdf.setTextColor(255, 210, 31);
      pdf.text('SyncTube Study Suite', 40, 80);

      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(16);
      pdf.setTextColor(241, 245, 249);
      pdf.text('Lecture Slides & Study Notes Summary', 40, 110);

      pdf.setFontSize(11);
      pdf.setTextColor(148, 163, 184);
      pdf.text(`📺 Lecture: ${currentVideoTitle || 'Study Session Video'}`, 40, 145);
      pdf.text(`🏛️ Room: ${roomName || roomId}`, 40, 165);
      pdf.text(`📅 Date: ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}`, 40, 185);
      pdf.text(`📸 Total Slides Captured: ${sortedSlides.length}`, 40, 205);
      pdf.text(`📝 Total Notes: ${notes.length}`, 40, 225);

      pdf.setDrawColor(255, 210, 31);
      pdf.setLineWidth(1.5);
      pdf.line(40, 245, pageWidth - 40, 245);

      const completedTasks = tasks.filter((t) => t.completed);
      if (tasks.length > 0) {
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(13);
        pdf.setTextColor(52, 211, 153);
        pdf.text(`✅ Study Goals Completed (${completedTasks.length}/${tasks.length})`, 40, 275);

        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(10);
        pdf.setTextColor(203, 213, 225);
        tasks.slice(0, 6).forEach((task, idx) => {
          pdf.text(`[${task.completed ? 'x' : ' '}]  ${task.text}`, 50, 298 + idx * 18);
        });
      }

      // Add each slide chronologically
      sortedSlides.forEach((slide, index) => {
        pdf.addPage('a4', 'landscape');

        // Background
        pdf.setFillColor(15, 20, 28);
        pdf.rect(0, 0, pageWidth, pageHeight, 'F');

        // Top Header Bar
        pdf.setFillColor(25, 33, 44);
        pdf.rect(0, 0, pageWidth, 42, 'F');

        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(13);
        pdf.setTextColor(255, 210, 31);
        pdf.text(`Slide ${index + 1} of ${sortedSlides.length}`, 30, 26);

        // Timestamp pill
        pdf.setFillColor(16, 185, 129);
        pdf.roundedRect(pageWidth - 140, 10, 110, 22, 4, 4, 'F');
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(11);
        pdf.setTextColor(0, 0, 0);
        pdf.text(`⏱️ ${slide.timestampFormatted}`, pageWidth - 128, 25);

        // Draw Slide Image
        const imgX = 30;
        const imgY = 52;
        const imgWidth = pageWidth - 60;
        const imgHeight = pageHeight - 135;

        try {
          pdf.addImage(slide.dataUrl, 'PNG', imgX, imgY, imgWidth, imgHeight, undefined, 'FAST');
        } catch (imgErr) {
          console.warn('Failed to add slide image to PDF', imgErr);
        }

        // Bottom Note Section
        pdf.setFillColor(20, 26, 36);
        pdf.rect(30, pageHeight - 75, pageWidth - 60, 55, 'F');
        pdf.setDrawColor(255, 255, 255, 0.1);
        pdf.rect(30, pageHeight - 75, pageWidth - 60, 55, 'S');

        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(10);
        pdf.setTextColor(148, 163, 184);
        pdf.text(`📝 Notes taken at [${slide.timestampFormatted}]:`, 40, pageHeight - 57);

        const relatedNote = notes.find((n) => Math.abs(n.timestampSeconds - slide.timestampSeconds) <= 20) || { text: slide.noteText || 'Lecture slide captured during focus study session.' };
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(10);
        pdf.setTextColor(241, 245, 249);
        const splitText = pdf.splitTextToSize(relatedNote.text || 'Lecture slide captured during focus study session.', pageWidth - 90);
        pdf.text(splitText.slice(0, 2), 40, pageHeight - 38);
      });

      const cleanTitle = (currentVideoTitle || 'Lecture').replace(/[^a-zA-Z0-9_-]/g, '_');
      pdf.save(`SyncTube_${cleanTitle}_Slides_${roomId}.pdf`);
      onNotify(`📥 Exported ${sortedSlides.length} lecture slides to PDF!`, 'success');
    } catch (err: any) {
      console.error('PDF export failed', err);
      onNotify('Failed to generate PDF: ' + (err?.message || 'Unknown error'), 'error');
    }
  };

  const completedTasksCount = tasks.filter((t) => t.completed).length;
  const taskProgress = tasks.length > 0 ? Math.round((completedTasksCount / tasks.length) * 100) : 0;

  return (
    <div className="study-suite-container">
      {/* Top Banner */}
      <div className="study-suite-header">
        <div className="study-suite-brand">
          <div className="study-brand-icon">
            <BookOpen size={16} />
          </div>
          <div>
            <h3 className="study-suite-title">Study Suite</h3>
            <span className="study-suite-subtitle">Distraction-Free Focus & Tools</span>
          </div>
        </div>

        <div className="study-header-actions">
          <button
            type="button"
            className="btn-study-action btn-screenshot-action"
            onClick={handleTakeScreenshot}
            title="Capture lecture video frame & timestamp snapshot (.png)"
          >
            <Camera size={13} className="text-amber-400" />
            <span>Screenshot</span>
          </button>

          <button
            type="button"
            className="btn-study-action btn-export-pdf"
            onClick={handleExportSlidesPdf}
            title="Download all captured lecture slides in a single organized PDF (.pdf)"
          >
            <FileDown size={13} />
            <span>Export PDF{capturedSlides.length > 0 ? ` (${capturedSlides.length})` : ''}</span>
          </button>

          <button
            type="button"
            className="btn-study-action btn-export-notes"
            onClick={handleExportNotes}
            title="Download Notes & Summary (.md)"
          >
            <Download size={13} />
            <span>Export Notes</span>
          </button>
        </div>
      </div>

      {/* Navigation Sub-Tabs */}
      <div className="study-subtabs-bar" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'notes'}
          className={`study-subtab-btn ${activeTab === 'notes' ? 'active' : ''}`}
          onClick={() => setActiveTab('notes')}
        >
          <FileText size={13} />
          <span>Notes ({notes.length})</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'tasks'}
          className={`study-subtab-btn ${activeTab === 'tasks' ? 'active' : ''}`}
          onClick={() => setActiveTab('tasks')}
        >
          <CheckSquare size={13} />
          <span>Tasks ({completedTasksCount}/{tasks.length})</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'planner'}
          className={`study-subtab-btn ${activeTab === 'planner' ? 'active' : ''}`}
          onClick={() => setActiveTab('planner')}
        >
          <Calendar size={13} />
          <span>Rules & Plan</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'docs'}
          className={`study-subtab-btn ${activeTab === 'docs' ? 'active' : ''}`}
          onClick={() => setActiveTab('docs')}
        >
          <BookOpen size={13} />
          <span>PDF / Docs</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'playlist'}
          className={`study-subtab-btn ${activeTab === 'playlist' ? 'active' : ''}`}
          onClick={() => setActiveTab('playlist')}
        >
          <ListMusic size={13} />
          <span>Playlist</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'search'}
          className={`study-subtab-btn ${activeTab === 'search' ? 'active' : ''}`}
          onClick={() => setActiveTab('search')}
        >
          <Search size={13} />
          <span>Video Search</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'ai'}
          className={`study-subtab-btn ${activeTab === 'ai' ? 'active' : ''}`}
          onClick={() => setActiveTab('ai')}
        >
          <Sparkles size={13} className="text-amber-400" />
          <span>Study AI</span>
        </button>
      </div>

      {/* Tab Panels */}
      <div className={`study-suite-content ${activeTab === 'playlist' ? 'study-suite-playlist-content' : ''} ${activeTab === 'search' ? 'study-suite-search-content' : ''}`}>

        {activeTab === 'playlist' && (
          <Playlist
            playlist={playlist}
            currentVideoId={currentVideoId || ''}
            userRole={currentUserRole}
            currentUserId={currentUserId}
            onAddToPlaylist={onAddToPlaylist}
            onImportPlaylist={onImportPlaylist}
            onPlayItem={onPlayPlaylistItem}
            onNextVideo={onNextVideo}
            onRemoveItem={onRemovePlaylistItem}
            onMoveToTop={onMoveToTop}
            onReorderPlaylist={onReorderPlaylist}
            onVoteItem={onVotePlaylistItem}
            onShuffle={onShufflePlaylist}
            onClear={onClearPlaylist}
            onOpenSearch={() => setActiveTab('search')}
          />
        )}

        {activeTab === 'search' && (
          <YouTubeSearchModal
            isOpen
            inline
            onClose={() => setActiveTab('notes')}
            userRole={currentUserRole}
            onPlayVideo={onPlayVideo}
            onAddToPlaylist={onAddToPlaylist}
            onAddPlaylistBatch={onAddPlaylistBatch}
            onRequestAction={onRequestAction}
            onNotify={onNotify}
          />
        )}

        {/* 1. NOTES TAB */}
        {activeTab === 'notes' && (
          <div className="study-notes-panel">
            {/* Note Input Box */}
            <div className="study-note-input-card">
              <div className="note-input-top-row">
                <span className="current-timestamp-badge" title="Timestamp captured at current playback time">
                  <Clock size={11} />
                  <span>{formatTime(currentPlaybackTime)}</span>
                </span>

                <select
                  className="note-tag-select"
                  value={noteTag}
                  onChange={(e) => setNoteTag(e.target.value as NonNullable<StudyNote['tag']>)}
                >
                  <option value="concept">💡 Concept</option>
                  <option value="formula">⚡ Formula</option>
                  <option value="doubt">❓ Question / Doubt</option>
                  <option value="general">📝 General</option>
                  <option value="other">✏️ Other</option>
                </select>
              </div>

              {noteTag === 'other' && (
                <input
                  type="text"
                  className="note-other-tag-input"
                  value={customNoteTag}
                  onChange={(e) => setCustomNoteTag(e.target.value)}
                  placeholder="Enter your own tag..."
                  aria-label="Custom note tag"
                  maxLength={40}
                />
              )}

              <textarea
                className="study-note-textarea"
                placeholder={`Type your note here... (captures [${formatTime(currentPlaybackTime)}] of current video)`}
                value={noteInput}
                onChange={(e) => setNoteInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                    handleAddNote();
                  }
                }}
                rows={2}
              />

              <div className="note-input-bottom-row">
                <span className="note-shortcut-hint">Ctrl+Enter to save</span>
                <button
                  type="button"
                  className="btn-save-note"
                  onClick={handleAddNote}
                  disabled={!noteInput.trim()}
                >
                  <Plus size={13} />
                  <span>Add Note [{formatTime(currentPlaybackTime)}]</span>
                </button>
              </div>
            </div>

            {/* Notes List Header */}
            <div className="notes-list-header">
              <span>Your Timestamped Notes</span>
              {notes.length > 0 && (
                <button type="button" className="notes-copy-btn" onClick={handleCopyNotes} title="Copy all notes">
                  <Copy size={12} />
                  <span>Copy All</span>
                </button>
              )}
            </div>

            {/* Notes List */}
            <div className="study-notes-list">
              {notes.length === 0 ? (
                <div className="study-empty-state">
                  <FileText size={28} className="text-slate-500" />
                  <p>No notes taken yet.</p>
                  <span>Play a lecture video and write notes at specific timestamps to easily jump back anytime!</span>
                </div>
              ) : (
                notes.map((note) => (
                  <div key={note.id} className="study-note-item">
                    <div className="note-item-header">
                      <button
                        type="button"
                        className="note-seek-pill"
                        onClick={() => {
                          onSeek(note.timestampSeconds);
                          onNotify(`⏩ Jumped to [${note.timestampFormatted}]`, 'info');
                        }}
                        title={`Click to jump video to ${note.timestampFormatted}`}
                      >
                        <Clock size={11} />
                        <strong>{note.timestampFormatted}</strong>
                      </button>

                      <span className={`note-tag-pill tag-${note.tag || 'general'}`}>
                        {note.tag === 'other' ? note.customTag || 'Other' : note.tag || 'concept'}
                      </span>

                      <div className="note-actions-group">
                        <button
                          type="button"
                          className="btn-note-edit"
                          onClick={() => handleStartEditNote(note)}
                          title="Edit note"
                        >
                          <Pencil size={12} />
                        </button>

                        <button
                          type="button"
                          className="note-delete-btn"
                          onClick={() => handleDeleteNote(note.id)}
                          title="Delete note"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </div>

                    {editingNoteId === note.id ? (
                      <div className="note-edit-container animate-scale-in">
                        <textarea
                          className="note-edit-textarea"
                          value={editingNoteText}
                          onChange={(e) => setEditingNoteText(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                              handleSaveEditNote(note.id);
                            }
                            if (e.key === 'Escape') handleCancelEditNote();
                          }}
                          autoFocus
                          placeholder="Edit your note..."
                        />
                        <div className="note-edit-buttons">
                          <button
                            type="button"
                            className="btn-save-edit"
                            onClick={() => handleSaveEditNote(note.id)}
                          >
                            <Check size={12} />
                            <span>Save</span>
                          </button>
                          <button
                            type="button"
                            className="btn-cancel-edit"
                            onClick={handleCancelEditNote}
                          >
                            <X size={12} />
                            <span>Cancel</span>
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <p className="note-item-text">{note.text}</p>
                        {note.screenshotDataUrl && (
                          <div className="note-screenshot-preview" title="Captured lecture slide">
                            <img src={note.screenshotDataUrl} alt="Slide preview" />
                          </div>
                        )}
                        <span className="note-item-video-title" title={note.videoTitle}>
                          📺 {note.videoTitle}
                        </span>
                      </>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* 2. TASKS TAB */}
        {activeTab === 'tasks' && (
          <div className="study-tasks-panel">
            {/* Task Progress Bar */}
            <div className="tasks-progress-card">
              <div className="tasks-progress-header">
                <span>Session Goals Progress</span>
                <strong>{taskProgress}% Completed</strong>
              </div>
              <div className="tasks-progress-track">
                <div className="tasks-progress-fill" style={{ width: `${taskProgress}%` }} />
              </div>
            </div>

            {/* Task Input */}
            <div className="study-task-input-row">
              <input
                type="text"
                className="study-task-input"
                placeholder="Add a study task or topic to cover..."
                value={taskInput}
                onChange={(e) => setTaskInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleAddTask();
                }}
              />
              <button
                type="button"
                className="btn-add-task"
                onClick={handleAddTask}
                disabled={!taskInput.trim()}
              >
                <Plus size={15} />
              </button>
            </div>

            {/* Task Items */}
            <div className="study-tasks-list">
              {tasks.length === 0 ? (
                <div className="study-empty-state">
                  <CheckSquare size={28} className="text-slate-500" />
                  <p>No tasks yet.</p>
                  <span>Add your goals for this study session!</span>
                </div>
              ) : (
                tasks.map((task) => (
                  <div key={task.id} className={`study-task-item ${task.completed ? 'completed' : ''}`}>
                    <button
                      type="button"
                      className={`task-checkbox ${task.completed ? 'checked' : ''}`}
                      onClick={() => handleToggleTask(task.id)}
                    >
                      {task.completed && <Check size={12} />}
                    </button>

                    {editingTaskId === task.id ? (
                      <div className="task-edit-container animate-scale-in">
                        <input
                          type="text"
                          className="task-edit-input"
                          value={editingTaskText}
                          onChange={(e) => setEditingTaskText(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleSaveEditTask(task.id);
                            if (e.key === 'Escape') handleCancelEditTask();
                          }}
                          autoFocus
                        />
                        <div className="task-edit-buttons">
                          <button
                            type="button"
                            className="btn-save-edit"
                            onClick={() => handleSaveEditTask(task.id)}
                            title="Save task"
                          >
                            <Check size={12} />
                          </button>
                          <button
                            type="button"
                            className="btn-cancel-edit"
                            onClick={handleCancelEditTask}
                            title="Cancel"
                          >
                            <X size={12} />
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <span className="task-text" onClick={() => handleToggleTask(task.id)}>
                          {task.text}
                        </span>
                        <div className="task-actions-group">
                          <button
                            type="button"
                            className="btn-task-edit"
                            onClick={() => handleStartEditTask(task)}
                            title="Edit task"
                          >
                            <Pencil size={12} />
                          </button>
                          <button
                            type="button"
                            className="task-delete-btn"
                            onClick={() => handleDeleteTask(task.id)}
                            title="Delete task"
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* 3. PLANNER & AUTOMATION RULES TAB */}
        {activeTab === 'planner' && (
          <div className="study-planner-panel">
            <div className="planner-hero-card">
              <div className="planner-hero-top">
                <div>
                  <h4>🎯 Smart Automation Rules</h4>
                  <p>Set custom reminders: e.g. "5 min baad khana khana", clock alarms, calendar tasks, or video points.</p>
                </div>
                <button
                  type="button"
                  className="btn-add-rule-toggle"
                  onClick={() => setIsCreatingRule((prev) => !prev)}
                >
                  <Plus size={13} />
                  <span>{isCreatingRule ? 'Cancel' : 'New Rule'}</span>
                </button>
              </div>

              {/* Custom Rule Creation Form */}
              {isCreatingRule && (
                <form onSubmit={handleCreateRule} className="create-rule-form animate-scale-in">
                  <div className="form-row">
                    <label>Rule Title / Reminder:</label>
                    <input
                      type="text"
                      placeholder="e.g. 5 min bad khana khane jana hai"
                      value={newRuleTitle}
                      onChange={(e) => setNewRuleTitle(e.target.value)}
                      required
                      autoFocus
                    />
                  </div>

                  <div className="form-row">
                    <label>When to trigger?</label>
                    <select
                      value={newRuleType}
                      onChange={(e) => setNewRuleType(e.target.value as any)}
                      className="rule-type-select"
                    >
                      <option value="countdown">⏳ Countdown Timer (e.g. After X minutes)</option>
                      <option value="clock_time">⏰ Specific Clock Time (e.g. At 20:30)</option>
                      <option value="calendar_datetime">📅 Specific Date & Time (Calendar)</option>
                      <option value="video_timestamp">🎬 Specific Video Timestamp</option>
                    </select>
                  </div>

                  {newRuleType === 'countdown' && (
                    <div className="form-row">
                      <label>Remind after (minutes):</label>
                      <div className="quick-mins-row">
                        {[2, 5, 10, 15, 30, 45].map((mins) => (
                          <button
                            key={mins}
                            type="button"
                            className={`btn-quick-min ${newCountdownMins === mins ? 'active' : ''}`}
                            onClick={() => setNewCountdownMins(mins)}
                          >
                            {mins}m
                          </button>
                        ))}
                        <input
                          type="number"
                          min="1"
                          max="240"
                          value={newCountdownMins}
                          onChange={(e) => setNewCountdownMins(parseInt(e.target.value, 10) || 5)}
                          style={{ width: '60px', padding: '0.25rem' }}
                        />
                      </div>
                    </div>
                  )}

                  {newRuleType === 'clock_time' && (
                    <div className="form-row">
                      <label>Trigger at Clock Time (24h format):</label>
                      <input
                        type="time"
                        value={newClockTime}
                        onChange={(e) => setNewClockTime(e.target.value)}
                        required
                      />
                    </div>
                  )}

                  {newRuleType === 'calendar_datetime' && (
                    <div className="form-row">
                      <label>Calendar Date & Time:</label>
                      <input
                        type="datetime-local"
                        value={newCalendarDateTime}
                        onChange={(e) => setNewCalendarDateTime(e.target.value)}
                        required
                      />
                    </div>
                  )}

                  {newRuleType === 'video_timestamp' && (
                    <div className="form-row">
                      <label>Trigger at Video Timestamp (seconds):</label>
                      <div className="video-ts-row">
                        <input
                          type="number"
                          min="0"
                          value={newVideoTimestamp}
                          onChange={(e) => setNewVideoTimestamp(parseInt(e.target.value, 10) || 0)}
                          placeholder="e.g. 180"
                        />
                        <button
                          type="button"
                          className="btn-use-current-ts"
                          onClick={() => setNewVideoTimestamp(Math.floor(currentPlaybackTime))}
                        >
                          Use Current: {formatTime(currentPlaybackTime)}
                        </button>
                      </div>
                    </div>
                  )}

                  <div className="form-row">
                    <label>Alert Message:</label>
                    <input
                      type="text"
                      placeholder="e.g. Khana khane jana hai! Take a 15-min break."
                      value={newActionMsg}
                      onChange={(e) => setNewActionMsg(e.target.value)}
                    />
                  </div>

                  <div className="form-checkbox-row">
                    <label>
                      <input
                        type="checkbox"
                        checked={newAutoPause}
                        onChange={(e) => setNewAutoPause(e.target.checked)}
                      />
                      <span>Automatically pause lecture video when reminder fires</span>
                    </label>
                  </div>

                  <div className="form-actions-row">
                    <button type="submit" className="btn-submit-rule">
                      <Plus size={13} />
                      <span>Activate Smart Rule</span>
                    </button>
                    <button
                      type="button"
                      className="btn-cancel-rule"
                      onClick={() => setIsCreatingRule(false)}
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              )}
            </div>

            <div className="study-rules-list">
              {rules.map((rule) => (
                <div key={rule.id} className={`study-rule-card ${rule.isCustom ? 'is-custom-rule' : ''}`}>
                  <div className="rule-card-top">
                    <div className="rule-info">
                      <div className="rule-title-row">
                        {rule.triggerType === 'countdown' && <Clock size={14} className="text-amber-400" />}
                        {rule.triggerType === 'clock_time' && <Bell size={14} className="text-yellow-400" />}
                        {rule.triggerType === 'calendar_datetime' && <Calendar size={14} className="text-blue-400" />}
                        {rule.triggerType === 'video_timestamp' && <Play size={14} className="text-rose-400" />}
                        {rule.triggerType === 'playback_duration' && <Coffee size={14} className="text-amber-400" />}
                        {rule.triggerType === 'time_interval' && <Droplet size={14} className="text-cyan-400" />}
                        {rule.triggerType === 'video_ended' && <FileText size={14} className="text-emerald-400" />}
                        <strong>{rule.title}</strong>
                        {rule.isCustom && <span className="custom-rule-tag">Custom</span>}
                      </div>
                      <p className="rule-desc">{rule.description}</p>
                    </div>

                    <div className="rule-actions-right">
                      {rule.isCustom && (
                        <button
                          type="button"
                          className="btn-delete-rule"
                          onClick={() => handleDeleteRule(rule.id)}
                          title="Delete this custom rule"
                        >
                          <Trash2 size={13} />
                        </button>
                      )}

                      <label className="rule-toggle-switch">
                        <input
                          type="checkbox"
                          checked={rule.enabled}
                          onChange={() => {
                            setRules((prev) =>
                              prev.map((r) => (r.id === rule.id ? { ...r, enabled: !r.enabled } : r))
                            );
                            onNotify(`${rule.title} is now ${!rule.enabled ? 'Enabled' : 'Disabled'}`, 'info');
                          }}
                        />
                        <span className="toggle-slider" />
                      </label>
                    </div>
                  </div>

                  <div className="rule-action-preview">
                    <Zap size={11} className="text-amber-300" />
                    <span>Action: "{rule.actionMessage}" {rule.autoPauseVideo ? '• (Auto-pauses video)' : ''}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 4. PDF & CUSTOM CHEAT SHEET TAB */}
        {activeTab === 'docs' && (
          <div className="study-docs-panel">
            <div className="docs-upload-bar">
              <label className="btn-upload-pdf">
                <Upload size={13} />
                <span>{pdfFileName ? 'Change PDF Slides' : 'Upload Lecture PDF / Slides'}</span>
                <input type="file" accept="application/pdf" onChange={handlePdfUpload} style={{ display: 'none' }} />
              </label>

              {pdfUrl && (
                <a
                  href={pdfUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-open-pdf-external"
                  title="Open in new window"
                >
                  <ExternalLink size={13} />
                </a>
              )}
            </div>

            {pdfUrl ? (
              <div className="pdf-viewer-frame-wrap">
                <iframe
                  src={pdfUrl}
                  title="Lecture Document Viewer"
                  className="pdf-viewer-iframe"
                />
              </div>
            ) : (
              <div className="cheat-sheet-editor-wrap">
                <div className="cheat-sheet-header">
                  <span>Quick Formula & Cheat Sheet Editor</span>
                  <span className="cheat-sheet-hint">Auto-saved</span>
                </div>
                <textarea
                  className="cheat-sheet-textarea"
                  value={customCheatSheet}
                  onChange={(e) => setCustomCheatSheet(e.target.value)}
                  placeholder="Paste lecture formulas, code snippets, or revision points here..."
                />
              </div>
            )}
          </div>
        )}

        {/* 5. STUDY AI TAB (Embedded Directly Inside Study Suite Without Leaving Study Mode) */}
        {activeTab === 'ai' && (
          <div className="study-ai-panel">
            <div className="study-ai-hero">
              <Sparkles size={20} color="#ffd21f" />
              <h4>SyncAI Lecture Assistant</h4>
              <p>Powered by Google AI Studio (Gemini 2.5). Ask doubts or click below for instant lecture help.</p>
            </div>

            <div className="study-ai-quick-prompts">
              <button
                type="button"
                className="study-ai-btn"
                onClick={() => setAiInitialPrompt('Summarise this lecture in 3 clear bullet points')}
              >
                <span>💡 Summarise Lecture</span>
                <p>Get a quick 3-point takeaway of the current lecture video.</p>
              </button>

              <button
                type="button"
                className="study-ai-btn"
                onClick={() => setAiInitialPrompt(`Explain the concept or formula shown around ${formatTime(currentPlaybackTime)} in simple terms`)}
              >
                <span>⚡ Explain Concept at [{formatTime(currentPlaybackTime)}]</span>
                <p>Understand the tricky point at the current video timestamp.</p>
              </button>

              <button
                type="button"
                className="study-ai-btn"
                onClick={() => setAiInitialPrompt('Generate 3 practice multiple choice questions based on this video topic to test my knowledge')}
              >
                <span>❓ Quiz Me on This Topic</span>
                <p>Generate 3 test questions to verify your understanding.</p>
              </button>

              <button
                type="button"
                className="study-ai-btn"
                onClick={() => setAiInitialPrompt('What should I study or watch next after this lecture to master the subject?')}
              >
                <span>🗺️ What to Study Next?</span>
                <p>Get recommendations on next topics or prerequisite review.</p>
              </button>
            </div>

            {/* Embedded SyncAI Interface */}
            <div className="study-ai-chat-wrap">
              <SyncAI
                roomId={roomId}
                roomName={roomName || roomSettings.name}
                roomSettings={roomSettings}
                currentUserId={currentUserId}
                currentUsername={currentUsername}
                currentUserRole={currentUserRole}
                currentUserAvatarId={currentUserAvatarId}
                participants={participants}
                currentVideoId={currentVideoId}
                currentVideoTitle={currentVideoTitle}
                currentVideoDuration={duration}
                currentPlaybackTime={currentPlaybackTime}
                playState={playState}
                playbackSpeed={playbackSpeed}
                volume={volume}
                isMuted={isMuted}
                playlist={playlist}
                watchHistory={watchHistory}
                chatMessages={chatMessages}
                activePoll={activePoll}
                recentActivities={recentActivities}
                onPlay={onPlay || (() => {})}
                onPause={onPause || (() => {})}
                onSeek={onSeek}
                onSetPlaybackSpeed={onSetPlaybackSpeed || (() => {})}
                onSetVolume={onSetVolume || (() => {})}
                onToggleMute={onToggleMute || (() => {})}
                onPlayVideo={onPlayVideo || (() => {})}
                onNextVideo={onNextVideo || (() => {})}
                onAddToPlaylist={onAddToPlaylist || (() => {})}
                onMoveToTop={onMoveToTop}
                onShufflePlaylist={onShufflePlaylist || (() => {})}
                onClearPlaylist={onClearPlaylist || (() => {})}
                onSendMessage={onSendMessage || (() => {})}
                onNotify={onNotify}
                initialPrompt={aiInitialPrompt}
                onClearInitialPrompt={() => setAiInitialPrompt('')}
              />
            </div>
          </div>
        )}

      </div>
    </div>
  );
};
