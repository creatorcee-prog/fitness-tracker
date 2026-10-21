"use client";

import { weekStart } from "@/lib/domain/stats";
import type { Session } from "@/lib/domain/types";

const DOW = ["Su", "M", "T", "W", "Th", "F", "Sa"];

/** Sun–Sat (or from config.split.weekStartsOn) strip: today circled, a dot under days with a finished workout. */
export function WeekStrip({ sessions, now, weekStartsOn }: { sessions: Session[]; now: Date; weekStartsOn: number }) {
  const start = weekStart(now, weekStartsOn);
  const trained = new Set(sessions.filter((s) => s.finishedAt).map((s) => new Date(s.startedAt).toDateString()));
  const todayKey = now.toDateString();
  const days = Array.from({ length: 7 }, (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i));
  return (
    <div className="weekstrip" aria-label="This week">
      {days.map((d) => {
        const key = d.toDateString();
        const cls = [key === todayKey ? "today" : "", d > now && key !== todayKey ? "future" : "", trained.has(key) ? "done" : ""].join(" ");
        return (
          <div key={key} className={cls} aria-label={`${d.toLocaleDateString(undefined, { weekday: "long" })}${trained.has(key) ? ", trained" : ""}`}>
            <div className="dow">{DOW[d.getDay()]}</div>
            <div className="num">{d.getDate()}</div>
            <div className="mark" />
          </div>
        );
      })}
    </div>
  );
}
