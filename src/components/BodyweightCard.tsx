"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { bodyweightTrend, relativeStrength, type BodyweightEntry } from "@/lib/domain/bodyweight";
import { localDate } from "@/lib/domain/split";
import type { Exercise, SetEntry } from "@/lib/domain/types";
import { formatWeight, fromKg, toKg } from "@/lib/domain/units";
import { useApp } from "./AppProvider";
import { useToast } from "./UndoToast";

const css = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(`--${name}`).trim();

/** Progress page: log bodyweight, see the trend (daily dots + 7-day average) and strength relative to bodyweight. */
export function BodyweightCard() {
  const { cfg, store, profile, version, now } = useApp();
  const unit = profile.unit;
  const toast = useToast(cfg.logging.undoToastMs);
  const today = localDate(now(), profile.timezone);
  const [entries, setEntries] = useState<BodyweightEntry[] | null>(null);
  const [sets, setSets] = useState<SetEntry[]>([]);
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [value, setValue] = useState("");
  const [date, setDate] = useState(today);
  const [err, setErr] = useState<string | null>(null);
  const chartEl = useRef<HTMLDivElement>(null);
  const w = (kg: number) => formatWeight(kg, unit, cfg.units.displayDecimals);

  const load = useCallback(async () => {
    try {
      const [bw, st, ex] = await Promise.all([store.listBodyweight(), store.listSets(), store.listExercises()]);
      setEntries(bw);
      setSets(st);
      setExercises(ex);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setEntries([]);
    }
  }, [store]);
  useEffect(() => {
    void load();
  }, [load, version]);

  const trend = useMemo(() => (entries ? bodyweightTrend(entries, today) : null), [entries, today]);
  const rel = useMemo(() => (trend?.latest ? relativeStrength(sets, exercises, trend.latest.weightKg, cfg, now()).slice(0, 5) : []), [trend, sets, exercises, cfg, now]);

  const save = async () => {
    const v = Number(value);
    const kg = toKg(v, unit);
    if (!(kg >= 25 && kg <= 300)) return setErr(`Enter your weight in ${unit}.`);
    const prev = entries?.find((e) => e.date === date);
    try {
      await store.logBodyweight({ date, weightKg: kg });
      setErr(null);
      setValue("");
      toast.show({ text: `Logged ${v} ${unit} for ${date === today ? "today" : date}`, undo: async () => { await (prev ? store.logBodyweight(prev) : store.deleteBodyweight(date)); await load(); } });
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  };

  const remove = async (e: BodyweightEntry) => {
    await store.deleteBodyweight(e.date);
    toast.show({ text: `Deleted ${e.date}`, undo: async () => { await store.logBodyweight(e); await load(); } });
    await load();
  };

  // Chart: one dot per weigh-in, plus the 7-day average line (what actually matters).
  useEffect(() => {
    if (!chartEl.current || !entries || entries.length < 2) return;
    let disposed = false;
    let chart: { dispose: () => void; resize: () => void } | null = null;
    const onResize = () => chart?.resize();
    (async () => {
      const echarts = await import("echarts");
      if (disposed || !chartEl.current) return;
      const c = echarts.init(chartEl.current, undefined, { renderer: "canvas" });
      chart = c;
      const disp = (kg: number) => Number(fromKg(kg, unit).toFixed(1));
      const t = (d: string) => Date.parse(`${d}T12:00:00`);
      const avg = entries.map((e) => {
        const win = entries.filter((x) => t(x.date) <= t(e.date) && t(x.date) > t(e.date) - 7 * 86_400_000);
        return [t(e.date), disp(win.reduce((a, x) => a + x.weightKg, 0) / win.length)];
      });
      const accent = css("accent") || "#5b8cff";
      c.setOption({
        backgroundColor: "transparent",
        animationDuration: 400,
        textStyle: { color: css("muted") || "#999", fontFamily: "inherit" },
        grid: { left: 44, right: 16, top: 16, bottom: 28 },
        xAxis: { type: "time", axisLine: { lineStyle: { color: css("border") || "#333" } }, splitLine: { show: false } },
        yAxis: { type: "value", scale: true, splitLine: { lineStyle: { color: css("border") || "#333", type: "dashed" } } },
        tooltip: { trigger: "axis", valueFormatter: (v: number) => `${v} ${unit}` },
        series: [
          { name: "Weigh-in", type: "scatter", symbolSize: 6, itemStyle: { color: css("muted") || "#999", opacity: 0.7 }, data: entries.map((e) => [t(e.date), disp(e.weightKg)]) },
          { name: "7-day average", type: "line", showSymbol: false, smooth: true, lineStyle: { width: 3, color: accent }, data: avg },
        ],
      });
      window.addEventListener("resize", onResize);
    })();
    return () => {
      disposed = true;
      window.removeEventListener("resize", onResize);
      chart?.dispose();
    };
  }, [entries, unit]);

  const signed = (kg: number) => `${kg >= 0 ? "+" : "−"}${Math.abs(Number(fromKg(kg, unit).toFixed(1)))} ${unit}`;

  // Arriving from a Today widget (/progress#bodyweight): scroll here once the content has loaded.
  useEffect(() => {
    if (entries && typeof location !== "undefined" && location.hash === "#bodyweight") document.getElementById("bodyweight")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [entries]);

  return (
    <div className="card stack" id="bodyweight">
      <h2 style={{ margin: 0 }}>Bodyweight</h2>
      <form className="row" onSubmit={(e) => { e.preventDefault(); void save(); }}>
        <input style={{ flex: 1, minWidth: 90 }} inputMode="decimal" placeholder={unit} value={value} onChange={(e) => setValue(e.target.value.replace(/[^\d.]/g, ""))} aria-label="Bodyweight" />
        <input type="date" value={date} max={today} onChange={(e) => setDate(e.target.value || today)} aria-label="Date" />
        <button className="btn primary" type="submit" disabled={!value}>Log</button>
      </form>
      {err && <span className="small" style={{ color: "var(--bad)" }}>{err}</span>}

      {trend?.latest ? (
        <>
          <div className="grid2">
            <div><div className="muted small">7-day average</div><strong style={{ fontSize: "1.3rem" }}>{trend.avg7 != null ? w(trend.avg7) : "—"}</strong></div>
            <div><div className="muted small">Trend</div><strong style={{ fontSize: "1.3rem" }}>{trend.perWeek != null ? `${signed(trend.perWeek)}/wk` : "—"}</strong></div>
          </div>
          <div className="muted small">
            Latest {w(trend.latest.weightKg)} on {trend.latest.date}
            {trend.change28 != null && ` · ${signed(trend.change28)} vs 4 weeks ago`}
            {trend.perWeek == null && " · trend shows after ~2 weeks of weigh-ins"}
          </div>
          {entries && entries.length >= 2 && <div ref={chartEl} className="chart" style={{ height: 200 }} />}

          {rel.length > 0 && (
            <div className="stack" style={{ gap: 6 }}>
              <strong className="small">Strength ÷ bodyweight (best est. 1RM, last 6 weeks)</strong>
              {rel.map((r) => (
                <div key={r.exercise} className="spread small">
                  <span>{r.exercise}</span>
                  <span><strong>{r.ratio.toFixed(2)}×</strong> <span className="muted">({w(r.e1rmKg)})</span></span>
                </div>
              ))}
            </div>
          )}

          <details>
            <summary className="small">Recent weigh-ins</summary>
            <ul className="setlist">
              {[...(entries ?? [])].reverse().slice(0, 10).map((e) => (
                <li key={e.date}>
                  <span className="grow small">{e.date}</span>
                  <span className="small">{w(e.weightKg)}</span>
                  <button className="btn sm ghost" aria-label={`Delete ${e.date}`} onClick={() => remove(e)}>✕</button>
                </li>
              ))}
            </ul>
          </details>
        </>
      ) : entries ? (
        <p className="muted small" style={{ margin: 0 }}>Weigh in a few mornings a week (same time, before eating) for a trend that means something. Also works in Discord: <code>/bodyweight 182</code>.</p>
      ) : null}
      {toast.node}
    </div>
  );
}
