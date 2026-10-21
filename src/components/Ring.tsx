"use client";

import { useId, type ReactNode } from "react";

/** Gradient progress ring (theme vars --ring-a → --ring-b). value: 0..1 */
export function Ring({ value, size = 120, stroke = 12, children }: { value: number; size?: number; stroke?: number; children?: ReactNode }) {
  const id = `ring${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`; // useId has colons, which break url(#id)
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(1, value));
  return (
    <div className="ring" style={{ width: size, height: size }}>
      <svg width={size} height={size} aria-hidden>
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="var(--ring-a)" />
            <stop offset="100%" stopColor="var(--ring-b)" />
          </linearGradient>
        </defs>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="color-mix(in srgb, currentColor 15%, transparent)" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={`url(#${id})`} strokeWidth={stroke} strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - v)} style={{ transition: "stroke-dashoffset .3s linear" }} />
      </svg>
      {children && <div className="ring-label">{children}</div>}
    </div>
  );
}
