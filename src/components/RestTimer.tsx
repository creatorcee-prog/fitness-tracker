"use client";

import { useEffect, useRef, useState } from "react";
import { useApp } from "./AppProvider";
import { Ring } from "./Ring";

export interface TimerState {
  endsAt: number;
  total: number;
}

function beep() {
  try {
    const ctx = new AudioContext();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.connect(g);
    g.connect(ctx.destination);
    o.frequency.value = 880;
    g.gain.setValueAtTime(0.15, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.4);
    o.start();
    o.stop(ctx.currentTime + 0.4);
  } catch {
    /* audio blocked */
  }
}

export function RestTimer({ timer, onChange }: { timer: TimerState | null; onChange: (t: TimerState | null) => void }) {
  const { cfg } = useApp();
  const [tick, setTick] = useState(Date.now());
  const fired = useRef<number | null>(null);

  useEffect(() => {
    if (!timer) return;
    const id = setInterval(() => setTick(Date.now()), 250);
    return () => clearInterval(id);
  }, [timer]);

  const left = timer ? Math.max(0, Math.ceil((timer.endsAt - tick) / 1000)) : 0;

  useEffect(() => {
    if (timer && left === 0 && fired.current !== timer.endsAt) {
      fired.current = timer.endsAt;
      if (cfg.restTimer.beep) beep();
      if (cfg.restTimer.vibrate && "vibrate" in navigator) navigator.vibrate?.([200, 100, 200]);
    }
  }, [left, timer, cfg.restTimer.beep, cfg.restTimer.vibrate]);

  if (!timer) return null;
  const adj = cfg.restTimer.adjustStepSeconds;
  const pct = timer.total ? (left / timer.total) * 100 : 0;
  const mm = Math.floor(left / 60);
  const ss = String(left % 60).padStart(2, "0");

  return (
    <div className={`timer ${left === 0 ? "done" : ""}`} aria-live="polite">
      <Ring value={timer.total ? left / timer.total : 0} size={44} stroke={5} />
      <span style={{ minWidth: 48, fontWeight: 700 }}>{left === 0 ? "Go!" : `${mm}:${ss}`}</span>
      <div className="bar"><div style={{ width: `${pct}%` }} /></div>
      <button className="btn sm" onClick={() => onChange({ ...timer, endsAt: Math.max(Date.now(), timer.endsAt - adj * 1000) })}>−{adj}s</button>
      <button className="btn sm" onClick={() => onChange({ endsAt: Math.max(Date.now(), timer.endsAt) + adj * 1000, total: timer.total + adj })}>+{adj}s</button>
      <button className="btn sm ghost" onClick={() => onChange(null)}>✕</button>
    </div>
  );
}
