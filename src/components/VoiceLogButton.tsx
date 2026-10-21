"use client";

import { useEffect, useRef, useState } from "react";

/* Minimal typing for the Web Speech API (not in TypeScript's DOM lib everywhere). */
interface Recognition {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
}
type RecognitionCtor = new () => Recognition;

function recognitionCtor(): RecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/**
 * Hold-free voice logging: tap, say "185 for 5", and what was heard is handed
 * back (never saved directly; the caller shows it for you to confirm). Uses the
 * browser's own speech recognition, so it's hidden where that isn't available
 * (e.g. Firefox). Safari and Chrome may send the audio to Apple or Google to
 * transcribe it.
 */
export function VoiceLogButton({ onHeard, onError }: { onHeard: (text: string) => void; onError: (msg: string) => void }) {
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const rec = useRef<Recognition | null>(null);

  useEffect(() => setSupported(!!recognitionCtor()), []);
  useEffect(() => () => rec.current?.stop(), []);

  if (!supported) return null;

  const start = () => {
    const Ctor = recognitionCtor();
    if (!Ctor) return;
    if (listening) return rec.current?.stop();
    const r = new Ctor();
    r.lang = navigator.language || "en-US";
    r.interimResults = false;
    r.maxAlternatives = 1;
    r.onresult = (e) => onHeard(e.results[0]?.[0]?.transcript ?? "");
    r.onerror = (e) =>
      onError(e.error === "not-allowed" || e.error === "service-not-allowed" ? "Microphone access is off. Allow it in your browser settings to log by voice." : e.error === "no-speech" ? "Didn't catch that. Tap the mic and try \"185 for 5\"." : `Voice input failed (${e.error}).`);
    r.onend = () => setListening(false);
    rec.current = r;
    setListening(true);
    try {
      r.start();
    } catch {
      setListening(false);
    }
  };

  return (
    <button
      type="button"
      className={`btn ${listening ? "active" : ""}`}
      onClick={start}
      aria-pressed={listening}
      aria-label={listening ? "Stop listening" : "Log by voice"}
      title='Log by voice: say "185 for 5" or "3 sets of 8 at 135"'
    >
      {listening ? "● Listening" : "🎤"}
    </button>
  );
}
