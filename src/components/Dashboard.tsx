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
import { defaultConfig } from "@/config/app.config";
import { useApp } from "./AppProvider";
import { CaloriesCard } from "./CaloriesCard";
import { Ring } from "./Ring";

interface Data {
  sessions: Session[];
  sets: SetEntry[];
  exercises: Map<string, Exercise>;
  latestPr: PREvent | null;
  friends: FriendStatus[];
}

const PR_LABEL: Record<string, string> = { weight: "Heaviest", reps_at_weight: "Rep PR", e1rm: "e1RM PR", session_volume: "Volume PR" };

/** Saved layouts predate newer widgets: append any missing ones with their default settings. */
export function withNewWidgets(saved: WidgetConfig[]): WidgetConfig[] {
  const have = new Set(saved.map((w) => w.id));
  return [...saved, ...defaultConfig.dashboard.widgets.filter((w) => !have.has(w.id))];
}

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
  const widgets = withNewWidgets(cfg.dashboard.widgets).filter((w) => w.enabled);
  const t = now();
  const ws = weekStart(t, cfg.split.weekStartsOn);
  const target = cfg.dashboard.weeklyTarget;

  const done = data ? finishedBetween(data.sessions, ws, new Date(t.getTime() + 1)).length : 0;
  const pct = (a: number, b: number) => `${Math.round(Math.min(1, b ? a / b : 0) * 100)}%`;
  const Bar = ({ v, of }: { v: number; of: number }) => (
    <div className="bar" aria-hidden>
      <i style={{ width: pct(v, of) }} />
    </div>
  );

  const render = (w: WidgetConfig) => {
    switch (w.id) {
      case "today":
        return (
          <button onClick={onFocusWorkout} style={{ all: "unset", cursor: "pointer", display: "flex", alignItems: "center", gap: 14 }}>
            <span style={{ display: "grid", gap: 2, flex: 1 }}>
              <span className="label">Today</span>
              <span className="value">{today?.kind === "day" ? today.day.name : today?.kind === "rest" ? "Rest day" : "No split yet"}</span>
              <span className="foot">
                {today?.kind === "day" ? `${today.day.exercises.length} exercises · tap to start` : today?.kind === "rest" ? "Recover, or train anyway below" : "Set one up in Split"}
              </span>
            </span>
            <Ring value={Math.min(1, done / target)} size={58} stroke={7}>
              <b style={{ fontSize: "0.85rem" }}>{done}/{target}</b>
            </Ring>
          </button>
        );
      case "week":
        return (
          <>
            <span className="label">This week</span>
            <span className="value">{done}<small>/{target} sessions</small></span>
            <Bar v={done} of={target} />
            <span className="foot">{pct(done, target)} of your weekly target</span>
          </>
        );
      case "streak": {
        const n = data ? weeklyStreak(data.sessions, t, cfg.split.weekStartsOn, target) : 0;
        return (
          <>
            <span className="label">Streak</span>
            <span className="value">{n}<small> wk</small></span>
            <Bar v={done} of={target} />
            <span className="foot">{done >= target ? "This week counts ✓" : `${target - done} more to keep it going`}</span>
          </>
        );
      }
      case "lastPr": {
        const pr = data?.latestPr;
        return (
          <>
            <span className="label">Latest PR</span>
            {pr ? (
              <>
                <span style={{ fontWeight: 700, fontSize: "1.05rem", letterSpacing: "-0.01em" }}>{data!.exercises.get(pr.exerciseId)?.name ?? "Lift"}</span>
                <span className="foot" style={{ opacity: 1 }}><span className="badge">{PR_LABEL[pr.type]}</span> {formatWeight(pr.weightKg, profile.unit, cfg.units.displayDecimals)} × {pr.reps}</span>
              </>
            ) : <span className="foot">None yet. Go set one.</span>}
          </>
        );
      }
      case "friends": {
        const f = data?.friends ?? [];
        const lifted = f.filter((x) => (x.setsToday ?? 0) > 0).length;
        return (
          <Link href="/friends" style={{ color: "inherit", display: "grid", gap: 4 }}>
            <span className="label">Friends</span>
            <span className="value">{lifted}<small>/{f.length}</small></span>
            <Bar v={lifted} of={f.length} />
            <span className="foot">lifted today</span>
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
        return (
          <>
            <span className="label">Top e1RM</span>
            {best ? (<><span className="value">{formatWeight(best.v, profile.unit, 0)}</span><span className="foot">{best.name}</span></>) : <span className="foot">No sets yet</span>}
          </>
        );
      }
      case "calories":
        return <CaloriesCard />;
      case "volume": {
        const thisWeek = data ? volumeKg(data.sets.filter((s) => Date.parse(s.createdAt) >= ws.getTime())) : 0;
        const lastStart = ws.getTime() - 7 * 86_400_000;
        const lastWeek = data ? volumeKg(data.sets.filter((s) => Date.parse(s.createdAt) >= lastStart && Date.parse(s.createdAt) < ws.getTime())) : 0;
        return (
          <>
            <span className="label">Volume this week</span>
            <span className="value">{formatWeight(thisWeek, profile.unit, 0)}</span>
            <Bar v={thisWeek} of={lastWeek || thisWeek} />
            <span className="foot">{lastWeek ? `${pct(thisWeek, lastWeek)} of last week` : "No data for last week"}</span>
          </>
        );
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
