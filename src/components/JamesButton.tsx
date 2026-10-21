"use client";

import type { Mood } from "@/lib/mascot/lines";
import { JamesSilhouette } from "./JamesSilhouette";

/**
 * "Talk to James" button: his face with a little chat badge, so it reads as
 * chatting with the coach (not a general or friends chat).
 */
export function JamesButton({ name, size = 44, onClick, className = "", mood = "happy" }: { name: string; size?: number; onClick: () => void; className?: string; mood?: Mood }) {
  return (
    <button className={`james-btn ${className}`} onClick={onClick} aria-label={`Chat with ${name}, your AI coach`} title={`Chat with ${name}`}>
      <JamesSilhouette mood={mood} size={size} />
      <span className="james-badge" aria-hidden>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20.5l1.4-4.8A8 8 0 1 1 21 12z" /></svg>
      </span>
    </button>
  );
}
