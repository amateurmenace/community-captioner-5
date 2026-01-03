
export interface Caption {
  id: string;
  text: string;
  translatedText?: string;
  timestamp: number;
  confidence: number;
  isFinal: boolean;
  speaker?: string;
  corrected?: boolean;
}

export interface DictionaryEntry {
  original: string;
  replacement: string;
  type: 'proper_noun' | 'place' | 'correction' | 'acronym';
  sensitivity?: number; // 0-1
}

export interface Notification {
  id: string;
  message: string;
  type: 'correction' | 'learning' | 'system' | 'error' | 'mode_switch';
  timestamp: number;
}

export interface SessionStats {
  durationSeconds: number;
  totalWords: number;
  averageConfidence: number;
  confidenceHistory: { time: number; score: number }[];
  correctionsMade: number;
  wpmHistory: { time: number; wpm: number }[];
  recentCorrections: string[];
  systemHealth: 'healthy' | 'degraded' | 'offline';
  latencyMs: number;
  modeSwitches?: { from: string; to: string; time: number }[];
}

export interface Session {
  id: string;
  date: number;
  name: string;
  stats: SessionStats;
  captions: Caption[];
  activeContextName: string | null;
}

export type OperationMode = 'balanced' | 'local' | 'resilience' | 'cloud';

export interface OverlaySettings {
  fontFamily: string;
  fontSize: number; // in px
  color: string;
  backgroundColor: string;
  // Position is now relative percentage 0-100
  x: number; 
  y: number;
  width: number;
  maxLines: number;
  textAlign: 'left' | 'center' | 'right';
}

export interface AudioDevice {
    deviceId: string;
    label: string;
}

export type UILanguage = 'en' | 'es' | 'fr';

export interface ContextSettings {
    sensitivity: number; // 0-100
    acronymExpansion: boolean;
    dialect: 'general' | 'medical' | 'legal';
}

export interface AppState {
  view: 'landing' | 'choice' | 'dashboard' | 'prerecorded' | 'analytics' | 'context' | 'caption_output';
  isRecording: boolean;
  captions: Caption[];
  interimText: string; // Lifted state for real-time preview
  dictionary: DictionaryEntry[];
  stats: SessionStats;
  mode: OperationMode;
  audioSourceId: string;
  targetLanguage: string;
  overlaySettings: OverlaySettings;
  outputMode: 'browser_overlay' | 'rtmp_embed';
  learningEnabled: boolean;
  notifications: Notification[];
  activeContextName: string | null;
  profanityFilter: boolean;
  contextSettings: ContextSettings; // New
  partialResults: boolean;
  speakerLabels: boolean;
  uiLanguage: UILanguage;
  pastSessions: Session[];
  // User Config
  apiKey?: string;
  localServerUrl?: string;
}

export enum ProcessingStatus {
  IDLE = 'idle',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  ERROR = 'error'
}
