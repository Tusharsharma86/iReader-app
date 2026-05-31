// Lightweight wrapper around the Web Speech API (free, on-device TTS).
// Used for the Deep Dive "Listen" button and the Morning Briefing playlist.

export type SpeechState = 'idle' | 'speaking' | 'paused';

export interface SpeakHandlers {
  onStateChange?: (s: SpeechState) => void;
  onItemStart?: (index: number) => void;
  onDone?: () => void;
}

const synth: SpeechSynthesis | undefined =
  typeof window !== 'undefined' ? window.speechSynthesis : undefined;

export function speechSupported(): boolean {
  return !!synth && typeof window !== 'undefined' && 'SpeechSynthesisUtterance' in window;
}

// Pick a decent English voice if available (prefer a natural/Google one).
function pickVoice(): SpeechSynthesisVoice | null {
  if (!synth) return null;
  const voices = synth.getVoices();
  if (!voices.length) return null;
  const pref = voices.find(v => /en[-_]?(IN|GB|US)/i.test(v.lang) && /google|natural|samantha|daniel/i.test(v.name))
    || voices.find(v => /en[-_]?IN/i.test(v.lang))
    || voices.find(v => /en[-_]?GB/i.test(v.lang))
    || voices.find(v => v.lang.toLowerCase().startsWith('en'));
  return pref ?? voices[0];
}

let currentHandlers: SpeakHandlers | null = null;

// Speak a queue of text chunks sequentially (each chunk = one utterance, so
// skip/stop is clean and onItemStart fires per chunk).
export function speakQueue(chunks: string[], handlers: SpeakHandlers = {}): void {
  if (!synth) return;
  stop();
  currentHandlers = handlers;
  const voice = pickVoice();
  let i = 0;

  const speakNext = () => {
    if (!synth || currentHandlers !== handlers) return; // superseded
    if (i >= chunks.length) {
      handlers.onStateChange?.('idle');
      handlers.onDone?.();
      currentHandlers = null;
      return;
    }
    const idx = i++;
    const u = new SpeechSynthesisUtterance(chunks[idx]);
    if (voice) u.voice = voice;
    u.rate = 1.02;
    u.pitch = 1.0;
    u.onstart = () => handlers.onItemStart?.(idx);
    u.onend = () => speakNext();
    u.onerror = () => speakNext();
    synth.speak(u);
  };

  handlers.onStateChange?.('speaking');
  speakNext();
}

export function pause(): void {
  if (synth && synth.speaking && !synth.paused) {
    synth.pause();
    currentHandlers?.onStateChange?.('paused');
  }
}

export function resume(): void {
  if (synth && synth.paused) {
    synth.resume();
    currentHandlers?.onStateChange?.('speaking');
  }
}

export function stop(): void {
  if (!synth) return;
  const h = currentHandlers;
  currentHandlers = null;
  synth.cancel();
  h?.onStateChange?.('idle');
}

// Strip ** markdown + collapse whitespace for clean speech.
export function cleanForSpeech(s: string): string {
  return (s || '').replace(/\*\*/g, '').replace(/\s+/g, ' ').trim();
}
