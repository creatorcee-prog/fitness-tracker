"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { fill, MOOD, pickLine, PRIORITY, type MascotEvent, type Mood } from "@/lib/mascot/lines";
import { useApp } from "./AppProvider";
import { JamesSilhouette } from "./JamesSilhouette";

interface Said {
  event: MascotEvent;
  text: string;
  mood: Mood;
  at: number;
}

interface MascotCtx {
  current: Said | null;
  /** Ask James to say something. A lower-priority event won't interrupt a recent higher one (one line per screen). */
  say: (event: MascotEvent, vars?: Record<string, string | number | undefined>) => void;
  dismiss: () => void;
}

const Ctx = createContext<MascotCtx | null>(null);
const RECENT_KEY = "ft:mascot-recent";

export function useMascot(): MascotCtx {
  return useContext(Ctx) ?? { current: null, say: () => {}, dismiss: () => {} };
}

export function MascotProvider({ children }: { children: ReactNode }) {
  const { cfg, profile } = useApp();
  const [current, setCurrent] = useState<Said | null>(null);
  const currentRef = useRef<Said | null>(null);
  currentRef.current = current;

  const say = useCallback(
    (event: MascotEvent, vars: Record<string, string | number | undefined> = {}) => {
      if (!cfg.mascot.enabled) return;
      const cur = currentRef.current;
      // Keep an important line (PR, goal) on screen for a while instead of replacing it with small talk.
      if (cur && PRIORITY[cur.event] > PRIORITY[event] && Date.now() - cur.at < cfg.mascot.holdMs) return;
      let recent: string[] = [];
      try {
        recent = JSON.parse(sessionStorage.getItem(RECENT_KEY) ?? "[]");
      } catch {
        /* ignore */
      }
      const line = pickLine(event, recent);
      try {
        sessionStorage.setItem(RECENT_KEY, JSON.stringify([line.text, ...recent].slice(0, 8)));
      } catch {
        /* ignore */
      }
      // "You" is the default display name; "That's a record, You." reads wrong, so fall back to "friend".
      const name = profile.displayName && profile.displayName !== "You" ? profile.displayName : undefined;
      setCurrent({ event, mood: MOOD[event], at: Date.now(), text: fill(line.text, { name, ...vars }) });
    },
    [cfg.mascot.enabled, cfg.mascot.holdMs, profile.displayName],
  );

  const value = useMemo(() => ({ current, say, dismiss: () => setCurrent(null) }), [current, say]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** Letter-by-letter reveal; a tap shows the whole line. Reduced motion shows it at once. */
function useTypewriter(text: string, msPerChar: number) {
  const [shown, setShown] = useState(0);
  useEffect(() => {
    const reduce = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce || msPerChar <= 0) return setShown(text.length);
    setShown(0);
    const id = setInterval(() => setShown((n) => (n >= text.length ? (clearInterval(id), n) : n + 1)), msPerChar);
    return () => clearInterval(id);
  }, [text, msPerChar]);
  return { visible: text.slice(0, shown), done: shown >= text.length, finish: () => setShown(text.length) };
}

/** James + speech bubble. Sits beside the workout, never over the logging controls. */
export function MascotBubble() {
  const { cfg } = useApp();
  const { current, dismiss } = useMascot();
  const tw = useTypewriter(current?.text ?? "", cfg.mascot.typeMs);
  if (!cfg.mascot.enabled || !current) return null;
  return (
    <div className="mascot" onClick={tw.finish} role="status" aria-live="polite" aria-label={`James says: ${current.text}`}>
      <JamesSilhouette mood={current.mood} size={52} />
      <div className="mascot-bubble">
        <span aria-hidden>{tw.visible}</span>
        {!tw.done && <span className="mascot-caret" aria-hidden />}
      </div>
      <button className="btn sm ghost" aria-label="Dismiss" onClick={(e) => { e.stopPropagation(); dismiss(); }}>✕</button>
    </div>
  );
}
