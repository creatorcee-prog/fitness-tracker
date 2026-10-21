"use client";

import { useRef, useState } from "react";

interface Props {
  label: string;
  value: number;
  step: number;
  min?: number;
  decimals?: number;
  longPressMs: number;
  onChange: (v: number) => void;
}

/** Plus/minus stepper. The number pad opens only on long-press of the value. */
export function Stepper({ label, value, step, min = 0, decimals = 1, longPressMs, onChange }: Props) {
  const [editing, setEditing] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fmt = (v: number) => String(Number(v.toFixed(decimals)));

  const press = () => {
    timer.current = setTimeout(() => setEditing(true), longPressMs);
  };
  const release = () => {
    if (timer.current) clearTimeout(timer.current);
  };

  return (
    <div className="stepper">
      <button type="button" aria-label={`decrease ${label}`} onClick={() => onChange(Math.max(min, value - step))}>−</button>
      {editing ? (
        <input
          autoFocus
          type="number"
          inputMode="decimal"
          aria-label={label}
          defaultValue={fmt(value)}
          onBlur={(e) => {
            const v = Number(e.target.value);
            if (Number.isFinite(v) && v >= min) onChange(v);
            setEditing(false);
          }}
          onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
        />
      ) : (
        <div className="val" onPointerDown={press} onPointerUp={release} onPointerLeave={release} onDoubleClick={() => setEditing(true)} title="Long-press or double-click to type">
          {fmt(value)}
          <small>{label}</small>
        </div>
      )}
      <button type="button" aria-label={`increase ${label}`} onClick={() => onChange(value + step)}>+</button>
    </div>
  );
}
