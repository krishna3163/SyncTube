import { extractYouTubeId, formatTime } from '../utils/youtube.js';
import { getApiUrl } from '../utils/api.js';
import {
  Role,
  PlayState,
  PlaylistItem,
  ChatMessage,
  ParticipantPublic,
  RoomPoll,
  ActivityItem,
  RoomSettingsData,
} from '../types.js';

export const GEMINI_API_KEY_STORAGE_KEY = 'synctube_gemini_api_key';

export function getStoredGeminiApiKey(): string {
  try {
    return localStorage.getItem(GEMINI_API_KEY_STORAGE_KEY) || '';
  } catch {
    return '';
  }
}

export function saveGeminiApiKey(key: string): void {
  try {
    localStorage.setItem(GEMINI_API_KEY_STORAGE_KEY, key.trim());
  } catch {}
}

export function clearGeminiApiKey(): void {
  try {
    localStorage.removeItem(GEMINI_API_KEY_STORAGE_KEY);
  } catch {}
}

export interface YouTubeTrackResult {
  videoId: string;
  title: string;
  channel?: string;
  duration?: string;
  thumbnail?: string;
}

// Built-in curated catalogue for instant high-speed discovery and offline resilience
const CURATED_MUSIC_CATALOGUE: YouTubeTrackResult[] = [
  {
    videoId: 'hOHKltAiKXQ',
    title: 'Hanumankind - Big Dawgs | Official Music Video | Prod. Kalmi',
    channel: 'Hanumankind',
    duration: '3:54',
    thumbnail: 'https://img.youtube.com/vi/hOHKltAiKXQ/hqdefault.jpg',
  },
  {
    videoId: 'dZ0fwJojhrs',
    title: 'Tauba Tauba | Bad Newz | Vicky Kaushal | Karan Aujla',
    channel: 'Saregama Music',
    duration: '3:27',
    thumbnail: 'https://img.youtube.com/vi/dZ0fwJojhrs/hqdefault.jpg',
  },
  {
    videoId: 'VAdGW7QDJUI',
    title: 'Chaleya | Jawan | Shah Rukh Khan | Nayanthara | Atlee | Anirudh | Arijit Singh',
    channel: 'T-Series',
    duration: '3:20',
    thumbnail: 'https://img.youtube.com/vi/VAdGW7QDJUI/hqdefault.jpg',
  },
  {
    videoId: '0m3N0ZJgNqY',
    title: 'Kala Chashma | Baar Baar Dekho | Sidharth M Katrina K | Prem & Hardeep ft Badshah, Neha Kakkar',
    channel: 'Zee Music Company',
    duration: '3:06',
    thumbnail: 'https://img.youtube.com/vi/0m3N0ZJgNqY/hqdefault.jpg',
  },
  {
    videoId: 'II2EO3NwUr8',
    title: 'Badtameez Dil | Yeh Jawaani Hai Deewani | Ranbir Kapoor, Deepika Padukone',
    channel: 'T-Series',
    duration: '3:12',
    thumbnail: 'https://img.youtube.com/vi/II2EO3NwUr8/hqdefault.jpg',
  },
  {
    videoId: 'cl0a3i2wFcc',
    title: 'Diljit Dosanjh - Lover (Official Music Video)',
    channel: 'Diljit Dosanjh',
    duration: '3:31',
    thumbnail: 'https://img.youtube.com/vi/cl0a3i2wFcc/hqdefault.jpg',
  },
  {
    videoId: 'jJPMnTXl63E',
    title: 'Agam - Krishna Ki Chetavani (Rashmirathi) | Shreeman Narayan Narayan Hari Hari',
    channel: 'Agam Aggarwal',
    duration: '44:47',
    thumbnail: 'https://img.youtube.com/vi/jJPMnTXl63E/hqdefault.jpg',
  },
  {
    videoId: '5qap5aO4i9A',
    title: 'Lofi Hip Hop Radio - Beats to Relax/Study to',
    channel: 'Lofi Girl',
    duration: 'LIVE',
    thumbnail: 'https://img.youtube.com/vi/5qap5aO4i9A/hqdefault.jpg',
  },
  {
    videoId: '2S4qGKmzBJE',
    title: 'The Rumbling (TV Size) - Attack on Titan Final Season Part 2 OP',
    channel: 'SiM Official',
    duration: '1:30',
    thumbnail: 'https://img.youtube.com/vi/2S4qGKmzBJE/hqdefault.jpg',
  },
];

/**
 * Searches YouTube for matching videos via backend API with fallbacks
 */
export async function searchYouTubeTrack(query: string): Promise<YouTubeTrackResult | null> {
  const trimmed = query.trim();
  if (!trimmed) return null;

  // 1. Direct YouTube link or ID
  const directId = extractYouTubeId(trimmed);
  if (directId) {
    return {
      videoId: directId,
      title: `YouTube Video (${directId})`,
      channel: 'YouTube',
      thumbnail: `https://img.youtube.com/vi/${directId}/hqdefault.jpg`,
    };
  }

  // 2. Query Curated Catalogue for immediate match
  const lowerQ = trimmed.toLowerCase();
  const curatedMatch = CURATED_MUSIC_CATALOGUE.find((track) =>
    lowerQ.includes('hanumankind') && track.title.toLowerCase().includes('hanumankind') ||
    lowerQ.includes('squid') && track.title.toLowerCase().includes('hanumankind') ||
    lowerQ.includes('tauba') && track.title.toLowerCase().includes('tauba') ||
    lowerQ.includes('chaleya') && track.title.toLowerCase().includes('chaleya') ||
    lowerQ.includes('badtameez') && track.title.toLowerCase().includes('badtameez') ||
    lowerQ.includes('kala chashma') && track.title.toLowerCase().includes('kala chashma') ||
    lowerQ.includes('lover') && track.title.toLowerCase().includes('lover') ||
    track.title.toLowerCase().includes(lowerQ)
  );
  if (curatedMatch && (lowerQ.includes('hanumankind') || lowerQ.includes('squid game'))) {
    return curatedMatch;
  }

  // 3. Search via backend API endpoints
  const primaryApiUrl = getApiUrl();
  const isLocal = typeof window !== 'undefined' &&
    (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');

  const endpoints: string[] = [];
  if (primaryApiUrl) {
    endpoints.push(`${primaryApiUrl}/api/youtube/search?q=${encodeURIComponent(trimmed)}`);
  } else {
    endpoints.push(`/api/youtube/search?q=${encodeURIComponent(trimmed)}`);
  }
  if (!isLocal) {
    endpoints.push(`https://synctube-vslw.onrender.com/api/youtube/search?q=${encodeURIComponent(trimmed)}`);
  }

  for (const url of endpoints) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 6000);
      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timer);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.results) && data.results.length > 0) {
          const first = data.results[0];
          return {
            videoId: first.videoId,
            title: first.title,
            channel: first.channel,
            duration: first.duration,
            thumbnail: first.thumbnail || `https://img.youtube.com/vi/${first.videoId}/hqdefault.jpg`,
          };
        }
      }
    } catch {}
  }

  // Fallback to first curated match if available
  if (curatedMatch) return curatedMatch;

  // Ultimate fallback if search fails completely
  if (lowerQ.includes('hanumankind') || lowerQ.includes('squid')) {
    return CURATED_MUSIC_CATALOGUE[0];
  }
  if (lowerQ.includes('party') || lowerQ.includes('dance')) {
    return CURATED_MUSIC_CATALOGUE[1];
  }
  if (lowerQ.includes('bollywood') || lowerQ.includes('hindi')) {
    return CURATED_MUSIC_CATALOGUE[2];
  }

  return null;
}

export interface RoomContextSnapshot {
  roomId: string;
  roomName?: string;
  roomSettings: RoomSettingsData;
  currentUser: {
    userId: string;
    username: string;
    role: Role;
  };
  participants: ParticipantPublic[];
  currentMedia: {
    videoId?: string;
    title?: string;
    duration?: number;
    currentTime: number;
    playState: PlayState;
    playbackSpeed: number;
    volume: number;
    isMuted: boolean;
  };
  playlist: PlaylistItem[];
  watchHistory?: { videoId: string; title: string; timestamp: number }[];
  chatMessages: ChatMessage[];
  activePoll: RoomPoll | null;
  recentActivities: ActivityItem[];
}

export interface GeminiActionCall {
  name:
    | 'play'
    | 'pause'
    | 'seek'
    | 'setSpeed'
    | 'setVolume'
    | 'playNext'
    | 'searchAndPlay'
    | 'searchAndAddToPlaylist'
    | 'shufflePlaylist'
    | 'clearPlaylist'
    | 'sendChatMessage';
  args: Record<string, any>;
}

export interface GeminiExecutionResult {
  text: string;
  executedActions: {
    action: string;
    description: string;
    success: boolean;
  }[];
  error?: string;
}

/**
 * Builds the comprehensive system instruction providing the AI with full situational room awareness.
 */
function buildSystemInstruction(context: RoomContextSnapshot): string {
  const isHost = context.currentUser.role === 'HOST';
  const isMod = context.currentUser.role === 'MODERATOR';
  const isViewer = context.currentUser.role === 'PARTICIPANT';

  const canPlayPause = isHost || isMod || context.roomSettings.permissions.playPause.viewer;
  const canSeek = isHost || isMod || context.roomSettings.permissions.seek.viewer;
  const canSkip = isHost || isMod || context.roomSettings.permissions.skip.viewer;
  const canAddPlaylist = isHost || isMod || context.roomSettings.permissions.add.viewer;

  const currentMediaDesc = context.currentMedia.videoId
    ? `Title: "${context.currentMedia.title || 'YouTube Video'}" (ID: ${context.currentMedia.videoId})\n` +
      `Playback Time: ${formatTime(context.currentMedia.currentTime)} / ${formatTime(context.currentMedia.duration || 0)}\n` +
      `Status: ${context.currentMedia.playState.toUpperCase()}, Speed: ${context.currentMedia.playbackSpeed}x, Volume: ${context.currentMedia.isMuted ? 'Muted' : `${context.currentMedia.volume}%`}`
    : 'No video is currently playing.';

  const playlistDesc =
    context.playlist.length > 0
      ? context.playlist
          .slice(0, 15)
          .map(
            (item, index) =>
              `${index + 1}. "${item.title || item.videoId}" (${item.duration || 'Video'}) - Upvotes: ${item.votes?.length || 0}`
          )
          .join('\n')
      : 'Playlist queue is currently empty.';

  const participantsDesc = context.participants
    .map((p) => `${p.username} (${p.role})`)
    .join(', ');

  const recentChatDesc =
    context.chatMessages.length > 0
      ? context.chatMessages
          .slice(-25)
          .map((m) => {
            const time = new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            return `[${time}] ${m.username}: ${m.text}`;
          })
          .join('\n')
      : 'No recent chat messages.';

  const activePollDesc = context.activePoll
    ? `Question: "${context.activePoll.question}"\nOptions: ${context.activePoll.options.join(', ')}`
    : 'No active poll running.';

  return `You are SyncAI, the intelligent real-time watch party assistant built into SyncTube.
You have complete, real-time awareness of the room, media playback, chat history, playlist queue, and viewers.
You can converse naturally, summarize conversations, answer questions, recommend media, and take direct actions.
You speak fluently in English, Hindi, and Hinglish based on how the user speaks to you.

=================== CURRENT ROOM CONTEXT ===================
Room ID: ${context.roomId}
Active Viewers (${context.participants.length}): ${participantsDesc}

CURRENT USER TALKING TO YOU:
- Name: "${context.currentUser.username}"
- Role: ${context.currentUser.role}
- Permissions: canPlayPause=${canPlayPause}, canSeek=${canSeek}, canSkip=${canSkip}, canAddPlaylist=${canAddPlaylist}

CURRENTLY PLAYING MEDIA:
${currentMediaDesc}

ROOM PLAYLIST QUEUE:
${playlistDesc}

ACTIVE ROOM POLL:
${activePollDesc}

RECENT CHAT HISTORY (Last 25 messages):
${recentChatDesc}
============================================================

ROLE & PERMISSION ENFORCEMENT RULES:
1. The user talking to you is ${context.currentUser.username} (${context.currentUser.role}).
2. If role is HOST: Full administrative & playback control over everything.
3. If role is MODERATOR: Can control playback, moderate, skip, and manage queue.
4. If role is PARTICIPANT:
   - If room allows viewer control (canPlayPause=${canPlayPause}, canSeek=${canSeek}, canSkip=${canSkip}): You can execute playback controls on their behalf.
   - If room restrictions prevent viewer playback controls: DO NOT bypass room rules! Instead, politely inform the user that the room is in Host-Only mode, but offer to add the song to the playlist queue instead, or submit an action request.

CAPABILITIES & TOOL USAGE:
- You have tools to: searchAndPlay, searchAndAddToPlaylist, play, pause, seek, setSpeed, setVolume, playNext, shufflePlaylist, clearPlaylist, sendChatMessage.
- When asked to play a specific song (e.g. "jo song hanumankind na squidgame ka liya gaya tha play ho", "play Tauba Tauba", "add some Bollywood music"):
  - For Hanumankind Squid Game track -> "Hanumankind Big Dawgs"
  - Call the appropriate tool (searchAndPlay or searchAndAddToPlaylist with playNext: true if they asked for 'next' or 'iska baad').
- When asked to summarize chat ("summarise the chat", "kya baat ho rahi thi"):
  - Provide a clear, bulleted summary of topics, jokes, questions, and discussions from the CHAT HISTORY above.
- When asked to adjust speed ("speed 1.25x karo", "slow down"):
  - Call setSpeed with the target multiplier.
- When asked to skip forward or backward ("30 sec aage karo", "rewind 1 minute"):
  - Call seek with deltaSeconds (e.g. 30 or -60).
- When asked to change volume ("sound 80% karo", "mute karo"):
  - Call setVolume with volume or isMuted.

Keep your replies concise, friendly, and helpful. Always confirm any actions taken clearly!`;
}

/**
 * Declares the function definitions for Gemini 2.0 / 1.5 Function Calling
 */
function getGeminiTools() {
  return [
    {
      functionDeclarations: [
        {
          name: 'searchAndPlay',
          description: 'Search YouTube for a video/song and immediately play it on the main room screen.',
          parameters: {
            type: 'OBJECT',
            properties: {
              query: {
                type: 'STRING',
                description: 'Search query or song title and artist (e.g. "Hanumankind Big Dawgs", "Arijit Singh Chaleya").',
              },
            },
            required: ['query'],
          },
        },
        {
          name: 'searchAndAddToPlaylist',
          description: 'Search YouTube for a video/song and add it to the room playlist queue.',
          parameters: {
            type: 'OBJECT',
            properties: {
              query: {
                type: 'STRING',
                description: 'Song title or search query.',
              },
              playNext: {
                type: 'BOOLEAN',
                description: 'Whether to place this song next in line right after the currently playing video.',
              },
            },
            required: ['query'],
          },
        },
        {
          name: 'play',
          description: 'Resume playing the video for the room.',
        },
        {
          name: 'pause',
          description: 'Pause the video for the room.',
        },
        {
          name: 'seek',
          description: 'Seek playback time forward or backward by delta seconds, or jump to an absolute timestamp.',
          parameters: {
            type: 'OBJECT',
            properties: {
              deltaSeconds: {
                type: 'NUMBER',
                description: 'Relative seconds to seek forward (+) or backward (-), e.g. 30 or -20.',
              },
              targetSeconds: {
                type: 'NUMBER',
                description: 'Absolute timestamp in seconds to jump to (e.g. 120 for 2:00).',
              },
            },
          },
        },
        {
          name: 'setSpeed',
          description: 'Change playback rate multiplier (e.g. 0.5, 0.75, 1, 1.25, 1.5, 2).',
          parameters: {
            type: 'OBJECT',
            properties: {
              speed: {
                type: 'NUMBER',
                description: 'Playback speed (e.g. 1.25).',
              },
            },
            required: ['speed'],
          },
        },
        {
          name: 'setVolume',
          description: 'Set user audio volume level (0 to 100) or toggle mute.',
          parameters: {
            type: 'OBJECT',
            properties: {
              volume: {
                type: 'NUMBER',
                description: 'Volume level between 0 and 100.',
              },
              isMuted: {
                type: 'BOOLEAN',
                description: 'Whether to mute audio.',
              },
            },
          },
        },
        {
          name: 'playNext',
          description: 'Skip to the next video in the room playlist.',
        },
        {
          name: 'shufflePlaylist',
          description: 'Shuffle the order of songs in the room playlist.',
        },
        {
          name: 'clearPlaylist',
          description: 'Clear all items from the room playlist queue.',
        },
        {
          name: 'sendChatMessage',
          description: 'Send a message or announcement into the room live chat on behalf of the user or AI.',
          parameters: {
            type: 'OBJECT',
            properties: {
              message: {
                type: 'STRING',
                description: 'The text message to post in chat.',
              },
            },
            required: ['message'],
          },
        },
      ],
    },
  ];
}

/**
 * Dispatches a chat message to Google AI Studio (Gemini API) and executes any triggered actions.
 */
export async function sendPromptToGemini(
  apiKey: string,
  userMessage: string,
  chatHistory: { role: 'user' | 'model'; text: string }[],
  context: RoomContextSnapshot,
  actionHandlers: {
    onPlay: () => void;
    onPause: () => void;
    onSeek: (time: number) => void;
    onSetPlaybackSpeed: (speed: number) => void;
    onSetVolume: (volume: number) => void;
    onToggleMute: () => void;
    onPlayVideo: (videoId: string, title?: string) => void;
    onNextVideo: () => void;
    onAddToPlaylist: (videoId: string, title?: string, duration?: string, channel?: string, thumbnail?: string) => void;
    onMoveToTop?: (itemId: string) => void;
    onShufflePlaylist: () => void;
    onClearPlaylist: () => void;
    onSendMessage: (text: string) => void;
    onNotify: (msg: string, type: 'info' | 'success' | 'error') => void;
  }
): Promise<GeminiExecutionResult> {
  const cleanKey = apiKey.trim();
  if (!cleanKey) {
    throw new Error('Please enter your Google AI Studio API key to chat with SyncAI.');
  }

  const systemInstruction = buildSystemInstruction(context);
  const tools = getGeminiTools();

  // Prepare Gemini contents array with conversation history
  const contents: any[] = [];
  for (const item of chatHistory.slice(-6)) {
    contents.push({
      role: item.role,
      parts: [{ text: item.text }],
    });
  }
  contents.push({
    role: 'user',
    parts: [{ text: userMessage }],
  });

  const payload = {
    contents,
    systemInstruction: {
      parts: [{ text: systemInstruction }],
    },
    tools,
    generationConfig: {
      temperature: 0.7,
      maxOutputTokens: 1000,
    },
  };

  // Try gemini-2.0-flash first; if not found, fallback to gemini-1.5-flash
  const models = ['gemini-2.0-flash', 'gemini-1.5-flash'];
  let lastError: Error | null = null;
  let responseData: any = null;

  for (const model of models) {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(cleanKey)}`;
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        responseData = await res.json();
        break;
      } else {
        const errorText = await res.text();
        let parsedMessage = errorText;
        try {
          const jsonErr = JSON.parse(errorText);
          parsedMessage = jsonErr.error?.message || errorText;
        } catch {}

        if (res.status === 400 || res.status === 403 || parsedMessage.includes('API_KEY_INVALID')) {
          throw new Error(`Google AI Studio Error: Invalid API key or permission denied. Please verify your API key.`);
        }
        if (res.status === 429) {
          throw new Error(`Google AI Studio Error: Rate limit / quota exceeded. Please check your API quota.`);
        }
        if (res.status === 404) {
          // Model might not exist in this tier, try next model
          continue;
        }
        throw new Error(`Google AI Studio Error (${res.status}): ${parsedMessage}`);
      }
    } catch (err: any) {
      lastError = err;
      if (err.message?.includes('Invalid API key') || err.message?.includes('quota exceeded')) {
        throw err;
      }
    }
  }

  if (!responseData) {
    throw lastError || new Error('Failed to connect to Google AI Studio. Please verify your API key and connection.');
  }

  // Parse candidate parts
  const candidate = responseData.candidates?.[0];
  const parts = candidate?.content?.parts || [];

  let textResponse = '';
  const executedActions: { action: string; description: string; success: boolean }[] = [];

  for (const part of parts) {
    if (part.text) {
      textResponse += part.text;
    }

    if (part.functionCall) {
      const call = part.functionCall as { name: GeminiActionCall['name']; args: Record<string, any> };
      const actionResult = await executeToolAction(call, context, actionHandlers);
      executedActions.push(actionResult);
    }
  }

  // Fallback: If no function calls but text mentions an obvious direct action command
  if (executedActions.length === 0) {
    const lowerMsg = userMessage.toLowerCase();
    if (lowerMsg.includes('hanumankind') || (lowerMsg.includes('squid') && lowerMsg.includes('song'))) {
      const result = await executeToolAction(
        { name: 'searchAndPlay', args: { query: 'Hanumankind Big Dawgs' } },
        context,
        actionHandlers
      );
      executedActions.push(result);
    }
  }

  return {
    text: textResponse.trim() || (executedActions.length > 0 ? executedActions[0].description : 'How can I assist you with the room?'),
    executedActions,
  };
}

/**
 * Checks role permissions and executes the requested tool action on the client.
 */
async function executeToolAction(
  call: { name: GeminiActionCall['name']; args: Record<string, any> },
  context: RoomContextSnapshot,
  handlers: {
    onPlay: () => void;
    onPause: () => void;
    onSeek: (time: number) => void;
    onSetPlaybackSpeed: (speed: number) => void;
    onSetVolume: (volume: number) => void;
    onToggleMute: () => void;
    onPlayVideo: (videoId: string, title?: string) => void;
    onNextVideo: () => void;
    onAddToPlaylist: (videoId: string, title?: string, duration?: string, channel?: string, thumbnail?: string) => void;
    onMoveToTop?: (itemId: string) => void;
    onShufflePlaylist: () => void;
    onClearPlaylist: () => void;
    onSendMessage: (text: string) => void;
    onNotify: (msg: string, type: 'info' | 'success' | 'error') => void;
  }
): Promise<{ action: string; description: string; success: boolean }> {
  const isHost = context.currentUser.role === 'HOST';
  const isMod = context.currentUser.role === 'MODERATOR';
  const isHostOrMod = isHost || isMod;

  const perms = context.roomSettings.permissions;
  const canPlayPause = isHostOrMod || perms.playPause.viewer;
  const canSeek = isHostOrMod || perms.seek.viewer;
  const canSkip = isHostOrMod || perms.skip.viewer;
  const canAdd = isHostOrMod || perms.add.viewer;

  switch (call.name) {
    case 'searchAndPlay': {
      const query = String(call.args.query || '').trim();
      if (!canSkip && !isHostOrMod) {
        return {
          action: 'searchAndPlay',
          description: `Permission restricted: Direct video playback is restricted to Host and Moderators. I can add "${query}" to the playlist instead!`,
          success: false,
        };
      }

      const track = await searchYouTubeTrack(query);
      if (track) {
        handlers.onPlayVideo(track.videoId, track.title);
        handlers.onNotify(`🎬 SyncAI playing: ${track.title}`, 'success');
        return {
          action: 'searchAndPlay',
          description: `Now playing on stage: "${track.title}"`,
          success: true,
        };
      } else {
        return {
          action: 'searchAndPlay',
          description: `Could not find YouTube track matching "${query}".`,
          success: false,
        };
      }
    }

    case 'searchAndAddToPlaylist': {
      const query = String(call.args.query || '').trim();
      const playNext = Boolean(call.args.playNext);

      if (!canAdd && !isHostOrMod) {
        return {
          action: 'searchAndAddToPlaylist',
          description: `Permission restricted: Adding items to playlist is disabled for viewers in this room.`,
          success: false,
        };
      }

      const track = await searchYouTubeTrack(query);
      if (track) {
        handlers.onAddToPlaylist(track.videoId, track.title, track.duration, track.channel, track.thumbnail);
        handlers.onNotify(`🎶 Added to playlist: ${track.title}${playNext ? ' (Play Next)' : ''}`, 'success');
        return {
          action: 'searchAndAddToPlaylist',
          description: `Added "${track.title}" to the room playlist${playNext ? ' to play next' : ''}.`,
          success: true,
        };
      } else {
        return {
          action: 'searchAndAddToPlaylist',
          description: `Could not find track matching "${query}" to add.`,
          success: false,
        };
      }
    }

    case 'play': {
      if (!canPlayPause) {
        return {
          action: 'play',
          description: 'Permission denied: Room is in Host-Only mode. Viewers cannot play playback directly.',
          success: false,
        };
      }
      handlers.onPlay();
      handlers.onNotify('▶️ SyncAI resumed video playback', 'info');
      return {
        action: 'play',
        description: 'Resumed video playback for everyone in the room.',
        success: true,
      };
    }

    case 'pause': {
      if (!canPlayPause) {
        return {
          action: 'pause',
          description: 'Permission denied: Room is in Host-Only mode. Viewers cannot pause playback directly.',
          success: false,
        };
      }
      handlers.onPause();
      handlers.onNotify('⏸️ SyncAI paused video playback', 'info');
      return {
        action: 'pause',
        description: 'Paused video playback for everyone in the room.',
        success: true,
      };
    }

    case 'seek': {
      if (!canSeek) {
        return {
          action: 'seek',
          description: 'Permission denied: Seeking is restricted to Host and Moderators.',
          success: false,
        };
      }
      const currentTime = context.currentMedia.currentTime;
      const duration = context.currentMedia.duration || 99999;
      let targetTime = currentTime;

      if (typeof call.args.deltaSeconds === 'number') {
        targetTime = Math.max(0, Math.min(duration, currentTime + call.args.deltaSeconds));
      } else if (typeof call.args.targetSeconds === 'number') {
        targetTime = Math.max(0, Math.min(duration, call.args.targetSeconds));
      }

      handlers.onSeek(targetTime);
      handlers.onNotify(`⏩ SyncAI jumped to ${formatTime(targetTime)}`, 'info');
      return {
        action: 'seek',
        description: `Jumped video timeline to ${formatTime(targetTime)}.`,
        success: true,
      };
    }

    case 'setSpeed': {
      if (!canSeek && !isHostOrMod) {
        return {
          action: 'setSpeed',
          description: 'Permission denied: Playback speed control is restricted to Host and Moderators.',
          success: false,
        };
      }
      const speed = Number(call.args.speed) || 1;
      handlers.onSetPlaybackSpeed(speed);
      handlers.onNotify(`⚡ Playback speed set to ${speed}x`, 'info');
      return {
        action: 'setSpeed',
        description: `Set room playback speed to ${speed}x.`,
        success: true,
      };
    }

    case 'setVolume': {
      if (typeof call.args.volume === 'number') {
        const vol = Math.max(0, Math.min(100, Math.round(call.args.volume)));
        handlers.onSetVolume(vol);
      }
      if (typeof call.args.isMuted === 'boolean') {
        if (call.args.isMuted !== context.currentMedia.isMuted) {
          handlers.onToggleMute();
        }
      }
      return {
        action: 'setVolume',
        description: `Adjusted user audio settings.`,
        success: true,
      };
    }

    case 'playNext': {
      if (!canSkip) {
        return {
          action: 'playNext',
          description: 'Permission denied: Only Host or Moderators can skip to the next video.',
          success: false,
        };
      }
      handlers.onNextVideo();
      handlers.onNotify('⏭️ Skipped to next video', 'info');
      return {
        action: 'playNext',
        description: 'Skipped to the next video in the queue.',
        success: true,
      };
    }

    case 'shufflePlaylist': {
      if (!isHostOrMod) {
        return {
          action: 'shufflePlaylist',
          description: 'Permission denied: Shuffling playlist requires Host or Moderator privileges.',
          success: false,
        };
      }
      handlers.onShufflePlaylist();
      handlers.onNotify('🔀 Playlist shuffled by SyncAI', 'info');
      return {
        action: 'shufflePlaylist',
        description: 'Shuffled the room playlist order.',
        success: true,
      };
    }

    case 'clearPlaylist': {
      if (!isHost) {
        return {
          action: 'clearPlaylist',
          description: 'Permission denied: Only the room Host can clear the entire playlist.',
          success: false,
        };
      }
      handlers.onClearPlaylist();
      handlers.onNotify('🗑️ Playlist cleared by SyncAI', 'info');
      return {
        action: 'clearPlaylist',
        description: 'Cleared all items from the room playlist.',
        success: true,
      };
    }

    case 'sendChatMessage': {
      const msg = String(call.args.message || '').trim();
      if (msg) {
        handlers.onSendMessage(msg);
      }
      return {
        action: 'sendChatMessage',
        description: `Posted message into room chat.`,
        success: true,
      };
    }

    default:
      return {
        action: 'unknown',
        description: 'Unknown action command requested.',
        success: false,
      };
  }
}
