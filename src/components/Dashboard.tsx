"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { WidgetConfig } from "@/config/app.config";
import { e1rm } from "@/lib/domain/e1rm";
import { replayPRs } from "@/lib/domain/prs";
import type { Today } from "@/lib/domain/split";
import { finishedBetween, volumeKg, weekStart, weeklyStreak } from "@/lib/domain/stats";
import type { Exercise, FriendStatus, PREvent, Session, SetEntry } from "@/lib/domain/types";
import { formatWeight } from "@/lib/domain/units";
import { useApp } from "./AppProvider";
import { Ring } from "./Ring";

interface Data {
  sessions: Session[];
  sets: SetEntry[];
  exercises: Map<string, Exercise>;
  latestPr: PREvent | null;
  friends: FriendStatus[];
}

const PR_LABEL: Record<string, string> = { weight: "Heaviest", reps_at_weight: "Rep PR", e1rm: "e1RM PR", session_volume: "Volume PR" };

/** Named colors map to theme tokens; anything else is used as a raw CSS color. */
function tileStyle(w: WidgetConfig): { className: string; style?: React.CSSProperties } {
  const span = w.size === 2 ? { gridColumn: "1 / -1" } : {};
  if (w.color === "hero" || w.color === "lime" || w.color === "surface") return { className: `tile ${w.color === "surface" ? "" : w.color}`, style: span };
  return { className: "tile", style: { ...span, background: w.color, borderColor: "transparent" } };
}

export function Dashboard({ today, onFocusWorkout }: { today: Today | null; onFocusWorkout?: () => void }) {
  const { cfg, store, profile, version, now } = useApp();
  const [data, setData] = useState<Data | null>(null);

  useEffect(() => {
    (async () => {
      const [sessions, sets, exList, friends] = await Promise.all([
        store.listSessions(),
        store.listSets(),
        store.listExercises(),
        cfg.friends.enabled ? store.friendsToday(now()).catch(() => []) : Promise.resolve([]),
      ]);
      const byEx = new Map<string, SetEntry[]>();
      for (const s of sets) byEx.set(s.exerciseId, [...(byEx.get(s.exerciseId) ?? []), s]);
      let latestPr: PREvent | null = null;
      for (const exSets of byEx.values()) {
        for (const e of replayPRs(exSets, sessions, cfg)) {
          if (!e.baseline && e.type !== "session_volume" && (!latestPr || e.achievedAt > latestPr.achievedAt)) latestPr = e;
        }
      }
      setData({ sessions, sets, exercises: new Map(exList.map((e) => [e.id, e])), latestPr, friends });
    })();
  }, [store, cfg, version, now]);

  if (!cfg.dashboard.enabled) return null;
  const widgets = cfg.dashboard.widgets.filter((w) => w.enabled);
  const t = now();
  const ws = weekStart(t, cfg.split.weekStartsOn);
  const target = cfg.dashboard.weeklyTarget;

  const render = (w: WidgetConfig) => {
    switch (w.id) {
      case "today":
        return (
          <button className="reset" onClick={onFocusWorkout} style={{ all: "unset", cursor: "pointer", display: "grid", gap: 4 }}>
            <span className="muted small">Today</span>
            <span style={{ fontSize: "1.6rem", fontWeight: 600 }}>
              {today?.kind === "day" ? today.day.name : today?.kind === "rest" ? "Rest day" : "No split yet"}
            </span>
            <span className="muted small">
              {today?.kind === "day" ? `${today.day.exercises.length} exercises · tap to start` : today?.kind === "rest" ? "Recover, or train anyway below" : "Set one up in Split"}
            </span>
          </button>
        );
      case "week": {
        const done = data ? finishedBetween(data.sessions, ws, new Date(t.getTime() + 1)).length : 0;
        return (
          <div className="row" style={{ justifyContent: "space-between" }}>
            <div>
              <div className="small" style={{ opacity: 0.8 }}>This week</div>
              <div style={{ fontSize: "1.6rem", fontWeight: 700 }}>{done}/{target}</div>
              <div className="small" style={{ opacity: 0.8 }}>sessions</div>
            </div>
            <Ring value={Math.min(1, done / target)} size={64} stroke={8} />
          </div>
        );
      }
      case "streak": {
        const n = data ? weeklyStreak(data.sessions, t, cfg.split.weekStartsOn, target) : 0;
        return (<><span className="muted small">Streak</span><span style={{ fontSize: "1.6rem", fontWeight: 700 }}>{n} wk</span><span className="muted small">≥{target} sessions/week</span></>);
      }
      case "lastPr": {
        const pr = data?.latestPr;
        return (
          <>
            <span className="muted small">Latest PR</span>
            {pr ? (
              <>
                <span style={{ fontWeight: 600 }}>{data!.exercises.get(pr.exerciseId)?.name ?? "Lift"}</span>
                <span><span className="badge">{PR_LABEL[pr.type]}</span> {formatWeight(pr.weightKg, profile.unit, cfg.units.displayDecimals)} × {pr.reps}</span>
              </>
            ) : <span className="muted">None yet. Go set one.</span>}
          </>
        );
      }
      case "friends": {
        const f = data?.friends ?? [];
        const lifted = f.filter((x) => (x.setsToday ?? 0) > 0).length;
        return (
          <Link href="/friends" style={{ color: "inherit", display: "grid", gap: 4 }}>
            <span className="muted small">Friends</span>
            <span style={{ fontSize: "1.6rem", fontWeight: 700 }}>{lifted}/{f.length}</span>
            <span className="muted small">lifted today</span>
          </Link>
        );
      }
      case "topLift": {
        let best: { name: string; v: number } | null = null;
        for (const s of data?.sets ?? []) {
          if (s.isWarmup || s.reps > cfg.prs.maxRepsForE1rm) continue;
          const v = e1rm(s.weightKg, s.reps, cfg.prs.formula);
          if (!best || v > best.v) best = { name: data!.exercises.get(s.exerciseId)?.name ?? "Lift", v };
        }
        return (<><span className="muted small">Top e1RM</span>{best ? (<><span style={{ fontSize: "1.4rem", fontWeight: 700 }}>{formatWeight(best.v, profile.unit, 0)}</span><span className="muted small">{best.name}</span></>) : <span className="muted">No sets yet</span>}</>);
      }
      case "volume": {
        const v = data ? volumeKg(data.sets.filter((s) => Date.parse(s.createdAt) >= ws.getTime())) : 0;
        return (<><span className="muted small">Volume this week</span><span style={{ fontSize: "1.4rem", fontWeight: 700 }}>{formatWeight(v, profile.unit, 0)}</span></>);
      }
    }
  };

  return (
    <div className="grid2" style={{ gridTemplateColumns: "1fr 1fr" }}>
      {widgets.map((w) => {
        const { className, style } = tileStyle(w);
        return <div key={w.id} className={className} style={style}>{render(w)}</div>;
      })}
    </div>
  );
}
