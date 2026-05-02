export interface Track {
  id: string;          // netease song id, or 'tts:<hash>' for DJ speech
  title: string;
  artist: string;
  url: string;         // playable URL
  durationMs: number;
  source: 'netease' | 'tts';
}

export interface HistoryEntry {
  trackId: string;
  title: string;
  artist: string;
  playedAt: string;    // ISO timestamp
  liked: boolean;
  skipped: boolean;
}

export interface UserProfile {
  name: string;
  bio: string;
  musicTaste: string;
  vibes: string;
}

export interface ContextBundle {
  time: string;
  weather: { description: string; tempC: number } | null;
  lastTrack: { title: string; artist: string } | null;
  recentHistory: HistoryEntry[];          // last 5
  recentDJScripts: string[];               // last 3
  profile: UserProfile;
  userMessage?: string;
}

export interface DJDecision {
  shouldSpeak: boolean;
  script: string | null;
  nextTrack: {
    source: 'favorites' | 'similar' | 'recommend' | 'search';
    hint: string;
  };
}

export interface ChatResponse {
  intent: 'play' | 'chat';
  reply: string;
  query?: string;
  count?: number;
}

export type SSEEvent =
  | { type: 'track-changed'; track: Track }
  | { type: 'dj-speaking'; audioUrl: string | null; text: string }
  | { type: 'dj-finished' }
  | { type: 'queue-update'; queue: Track[] };
