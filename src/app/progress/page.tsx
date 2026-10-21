"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useApp } from "@/components/AppProvider";
import { BodyweightCard } from "@/components/BodyweightCard";
import { PlateauCard } from "@/components/PlateauCard";
import { GoalsCard } from "@/components/GoalsCard";
import { e1rm } from "@/lib/domain/e1rm";
import { percentageGains } from "@/lib/domain/gain";
import { currentRecords, replayPRs } from "@/lib/domain/prs";
import type { Exercise, PREvent, Session, SetEntry } from "@/lib/domain/types";
import { formatWeight, fromKg } from "@/lib/domain/units";
import { weekStart } from "@/lib/domain/stats";

type View = "e1rm" | "top" | "volume";

/** Keep only the highest-value event per (session, type). */
function bestPerSession(events: PREvent[]): PREvent[] {
  const m = new Map<string, PREvent>();
  for (const e of events) {
    const k = `${e.sessionId}:${e.type}`;
    const cur = m.get(k);
    if (!cur || e.value >= cur.value) m.set(k, e);
  }
  return [...m.values()].sort((a, b) => a.achievedAt.localeCompare(b.achievedAt));
}

const css = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(`--${name}`).trim();

export default function ProgressPage() {
  const { cfg, store, profile, version, now } = useApp();
  const unit = profile.unit;
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [sets, setSets] = useState<SetEntry[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [exId, setExId] = useState<string>("");
  const [range, setRange] = useState(cfg.progress.defaultRange);
  const [view, setView] = useState<View>("e1rm");
  const chartEl = useRef<HTMLDivElement>(null);

  useEffect(() => {
    (async () => {
      const [ex, st, se] = await Promise.all([store.listExercises(), store.listSets(), store.listSessions()]);
      const logged = new Set(st.map((s) => s.exerciseId));
      const withData = ex.filter((e) => logged.has(e.id));
      setExercises(withData);
      setSets(st);
      setSessions(se);
      setExId((cur) => cur || withData[0]?.id || "");
    })();
  }, [store, version]);

  const exSets = useMemo(() => sets.filter((s) => s.exerciseId === exId), [sets, exId]);
  const events = useMemo(() => replayPRs(exSets, sessions, cfg), [exSets, sessions, cfg]);
  const records = currentRecords(events);
  const gains = useMemo(() => percentageGains(exSets, now(), cfg), [exSets, cfg, now]);
  const days = cfg.progress.chartRanges.find((r) => r.id === range)?.days ?? null;
  const fromT = days == null ? -Infinity : now().getTime() - days * 86_400_000;

  useEffect(() => {
    if (!chartEl.current || !exId) return;
    let disposed = false;
    let chart: { dispose: () => void; resize: () => void } | null = null;
    const onResize = () => chart?.resize();

    (async () => {
      const echarts = await import("echarts");
      if (disposed || !chartEl.current) return;
      const c = echarts.init(chartEl.current, undefined, { renderer: "canvas" });
      chart = c;
      const text = css("muted") || "#999";
      const grid = css("border") || "#333";
      const accent = css("accent") || "#5b8cff";
      const prColor = css("pr") || "#f2b53a";
      const highlight = css("highlight") || accent;
      const disp = (kg: number) => Number(fromKg(kg, unit).toFixed(1));
      const working = exSets.filter((s) => !s.isWarmup && Date.parse(s.createdAt) >= fromT);

      // Per-session aggregates.
      const bySession = new Map<string, SetEntry[]>();
      for (const s of working) bySession.set(s.sessionId, [...(bySession.get(s.sessionId) ?? []), s]);
      const points = [...bySession.values()].map((ss) => {
        const t = Date.parse(ss[0].createdAt);
        const eligible = ss.filter((s) => s.reps <= cfg.prs.maxRepsForE1rm);
        const best = eligible.length ? Math.max(...eligible.map((s) => e1rm(s.weightKg, s.reps, cfg.prs.formula))) : null;
        const top = Math.max(...ss.map((s) => s.weightKg));
        return { t, best, top };
      }).sort((a, b) => a.t - b.t);
      if (cfg.debug.logStore) console.debug("[chart] points", points);

      // One marker per session: the best PR of that type (several sets can each beat the old record).
      const prPoints = (type: PREvent["type"]) =>
        bestPerSession(events.filter((e) => e.type === type && !e.baseline && Date.parse(e.achievedAt) >= fromT))
          .map((e) => ({ value: [Date.parse(e.achievedAt), disp(e.value)], weight: disp(e.weightKg), reps: e.reps }));

      const base = {
        backgroundColor: "transparent",
        animationDuration: 450,
        textStyle: { color: text, fontFamily: "inherit" },
        grid: { left: 44, right: 16, top: 24, bottom: 32 },
        xAxis: { type: "time", axisLine: { lineStyle: { color: grid } }, splitLine: { show: false } },
        yAxis: { type: "value", scale: true, axisLine: { show: false }, splitLine: { lineStyle: { color: grid, type: "dashed" } } },
        tooltip: {
          trigger: "item",
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          formatter: (p: any) => {
            const d = new Date(p.value[0]).toLocaleDateString();
            if (p.data?.reps) return `🏆 PR · ${d}<br/>${p.data.weight} ${unit} × ${p.data.reps}<br/>${p.seriesName}: ${p.value[1]} ${unit}`;
            return `${d}<br/>${p.seriesName}: ${p.value[1]} ${unit}`;
          },
        },
      };

      if (view === "volume") {
        const weeks = new Map<number, number>();
        for (const s of working) {
          const w = weekStart(new Date(s.createdAt), cfg.split.weekStartsOn).getTime();
          weeks.set(w, (weeks.get(w) ?? 0) + s.weightKg * s.reps);
        }
        c.setOption({
          ...base,
          tooltip: { trigger: "axis" },
          series: [{ name: "Weekly volume", type: "bar", itemStyle: { color: highlight, borderRadius: [6, 6, 0, 0] }, data: [...weeks.entries()].sort((a, b) => a[0] - b[0]).map(([t, v]) => [t, Math.round(fromKg(v, unit))]) }],
        });
      } else {
        const isE = view === "e1rm";
        const name = isE ? "Best e1RM" : "Top set";
        c.setOption({
          ...base,
          series: [
            {
              name, type: "line", smooth: false, showSymbol: true, symbolSize: 6,
              lineStyle: { width: 3, color: accent }, itemStyle: { color: accent },
              areaStyle: { color: accent, opacity: 0.15 },
              data: points.filter((p) => (isE ? p.best != null : true)).map((p) => [p.t, disp(isE ? p.best! : p.top)]),
            },
            { name: isE ? "e1RM PR" : "Weight PR", type: "scatter", symbol: "pin", symbolSize: 26, itemStyle: { color: prColor }, z: 5, data: prPoints(isE ? "e1rm" : "weight") },
          ],
        });
      }
      window.addEventListener("resize", onResize);
    })();

    return () => {
      disposed = true;
      window.removeEventListener("resize", onResize);
      chart?.dispose();
    };
  }, [exId, exSets, events, view, range, fromT, unit, cfg]);

  const w = (kg: number | null | undefined) => (kg == null ? "—" : formatWeight(kg, unit, cfg.units.displayDecimals));

  if (!exercises.length) {
    return (
      <div className="page stack">
        <h1>Progress</h1>
        <GoalsCard />
        <BodyweightCard />
        <p className="muted">Log a few sets and your graphs show up here. (Debugging? Settings → Generate demo history.)</p>
      </div>
    );
  }

  return (
    <div className="page stack">
      <h1>Progress</h1>
      <select value={exId} onChange={(e) => setExId(e.target.value)} aria-label="Exercise">
        {exercises.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
      </select>

      <div className="spread" style={{ flexWrap: "wrap" }}>
        <div className="segmented">
          {(["e1rm", "top", "volume"] as View[]).map((v) => (
            <button key={v} className={view === v ? "on" : ""} onClick={() => setView(v)}>{v === "e1rm" ? "e1RM" : v === "top" ? "Top set" : "Volume"}</button>
          ))}
        </div>
        <div className="segmented">
          {cfg.progress.chartRanges.map((r) => (
            <button key={r.id} className={range === r.id ? "on" : ""} onClick={() => setRange(r.id)}>{r.label}</button>
          ))}
        </div>
      </div>

      <div className="card"><div ref={chartEl} className="chart" /></div>

      <PlateauCard />

      <GoalsCard />

      <BodyweightCard />

      <div className="tile hero">
        <span className="small" style={{ opacity: 0.8 }}>Percentage gain (best e1RM, last {cfg.progress.currentWindowDays} days)</span>
        <div className="grid2">
          {gains.map((g) => (
            <div key={g.baselineId}>
              <div style={{ fontSize: "1.6rem", fontWeight: 700 }}>{g.percent == null ? "—" : `${g.percent >= 0 ? "+" : ""}${g.percent.toFixed(1)}%`}</div>
              <div className="small" style={{ opacity: 0.8 }}>vs {g.label.toLowerCase()}{g.baseline != null && ` (${w(g.baseline)})`}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="card">
        <h2>Records</h2>
        <div className="grid2">
          <div className="stat"><div className="muted small">Heaviest</div><div className="v">{w(records.weight?.value)}</div><div className="muted small">{records.weight && `× ${records.weight.reps}`}</div></div>
          <div className="stat"><div className="muted small">Best e1RM ({cfg.prs.formula})</div><div className="v">{w(records.e1rm?.value)}</div><div className="muted small">{records.e1rm && `${w(records.e1rm.weightKg)} × ${records.e1rm.reps}`}</div></div>
          <div className="stat"><div className="muted small">Best session volume</div><div className="v">{w(records.session_volume?.value)}</div></div>
        </div>
        <p className="muted small">Estimates can miss a true max by 10% or more; sets above {cfg.prs.maxRepsForE1rm} reps don't count toward e1RM PRs.</p>
      </div>

      <div className="card">
        <h2>PR history</h2>
        <ul className="setlist">
          {bestPerSession(events.filter((e) => !e.baseline)).reverse().slice(0, 30).map((e, i) => (
            <li key={i}>
              <span className="grow">{new Date(e.achievedAt).toLocaleDateString()}</span>
              <span className="badge">{e.type === "reps_at_weight" ? "Rep PR" : e.type === "e1rm" ? "e1RM" : e.type === "weight" ? "Heaviest" : "Volume"}</span>
              <span>{e.type === "session_volume" ? w(e.value) : `${w(e.weightKg)} × ${e.reps}`}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
