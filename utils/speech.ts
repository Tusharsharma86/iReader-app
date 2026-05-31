// expo-speech wrapper for audio briefings (Deep Dive "Listen" + Morning
// Briefing playlist). Same surface as the web speech util so screens share
// logic. expo-speech has no native queue, so we chain utterances via onDone.
import * as Speech from 'expo-speech';

export type SpeechState = 'idle' | 'speaking' | 'paused';

export interface SpeakHandlers {
  onStateChange?: (s: SpeechState) => void;
  onItemStart?: (index: number) => void;
  onDone?: () => void;
}

export function speechSupported(): boolean { return true; }

let token = 0; // bumps on every stop() so stale onDone callbacks are ignored

export function speakQueue(chunks: string[], handlers: SpeakHandlers = {}): void {
  stop();
  const myToken = ++token;
  let i = 0;

  const speakNext = () => {
    if (myToken !== token) return; // superseded by a newer call/stop
    if (i >= chunks.length) {
      handlers.onStateChange?.('idle');
      handlers.onDone?.();
      return;
    }
    const idx = i++;
    handlers.onItemStart?.(idx);
    Speech.speak(chunks[idx], {
      rate: 1.0,
      onDone: () => { if (myToken === token) speakNext(); },
      onStopped: () => { /* stop() handles state */ },
      onError: () => { if (myToken === token) speakNext(); },
    });
  };

  handlers.onStateChange?.('speaking');
  speakNext();
}

let pausedState = false;
export function pause(): void {
  Speech.pause().then(() => { pausedState = true; }).catch(() => {});
}
export function resume(): void {
  Speech.resume().then(() => { pausedState = false; }).catch(() => {});
}
export function stop(): void {
  token++;            // invalidate any in-flight queue
  pausedState = false;
  Speech.stop().catch(() => {});
}

export function isPaused(): boolean { return pausedState; }

export function cleanForSpeech(s: string): string {
  return (s || '').replace(/\*\*/g, '').replace(/\s+/g, ' ').trim();
}
