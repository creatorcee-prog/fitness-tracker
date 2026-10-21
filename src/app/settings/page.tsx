"use client";

import { useEffect, useState } from "react";
import { defaultConfig, type Unit, type WidgetConfig } from "@/config/app.config";
import { deepMerge } from "@/config/runtime";
import { contrastRatio, THEME_PRESETS } from "@/config/themes";
import { useApp } from "@/components/AppProvider";
import { useToast } from "@/components/UndoToast";
import { generateDemoHistory } from "@/lib/service";
import { SupabaseStore } from "@/lib/store/supabase";

const WIDGET_LABEL: Record<WidgetConfig["id"], string> = {
  today: "Today's split day", week: "Sessions this week", streak: "Weekly streak", lastPr: "Latest PR",
  friends: "Friends lifting today", topLift: "Top e1RM", volume: "Weekly volume",
};
const NAMED_COLORS = ["surface", "hero", "lime"];
const CONTRAST_PAIRS: [string, string][] = [["text", "bg"], ["text", "surface"], ["accent-text", "accent"], ["highlight-text", "highlight"]];

type Overrides = Record<string, unknown>;

export default function SettingsPage() {
  const { cfg, store, profile, setProfile, overrides, setOverrides, refresh, now } = useApp();
  const toast = useToast(cfg.logging.undoToastMs);
  const [json, setJson] = useState("");
  const [jsonErr, setJsonErr] = useState<string | null>(null);
  const [name, setName] = useState(profile.displayName);
  const [tz, setTz] = useState(profile.timezone);

  useEffect(() => setJson(JSON.stringify(overrides ?? {}, null, 2)), [overrides]);

  const ov = (overrides ?? {}) as Overrides;
  /** Merge a partial config into the saved overrides (with undo). */
  const patch = (p: Overrides, label?: string) => {
    const prev = overrides ?? null;
    setOverrides(deepMerge(ov, p));
    if (label) toast.show({ text: label, undo: () => setOverrides(prev) });
  };

  // Arrays are replaced wholesale by deepMerge, so widget edits write the full list.
  const widgets = cfg.dashboard.widgets;
  const setWidgets = (w: WidgetConfig[]) => patch({ dashboard: { widgets: w } });
  const updWidget = (i: number, p: Partial<WidgetConfig>) => setWidgets(widgets.map((w, j) => (j === i ? { ...w, ...p } : w)));
  const moveWidget = (i: number, d: number) => {
    const j = i + d;
    if (j < 0 || j >= widgets.length) return;
    const out = [...widgets];
    [out[i], out[j]] = [out[j], out[i]];
    setWidgets(out);
  };

  const themeVars = { ...(THEME_PRESETS[cfg.theme.preset] ?? THEME_PRESETS.midnight).vars, ...cfg.theme.vars };
  const colorKeys = Object.keys(themeVars).filter((k) => /^#[0-9a-f]{6}$/i.test(themeVars[k]));

  const saveProfile = async (p: { unit?: Unit; displayName?: string; timezone?: string }) => {
    setProfile(await store.updateProfile(p));
    refresh();
  };

  const download = async () => {
    const data = await store.exportAll();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `fitness-export-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
  };

  const downloadCsv = async () => {
    const [sets, ex] = await Promise.all([store.listSets(), store.listExercises()]);
    const names = new Map(ex.map((e) => [e.id, e.name]));
    const rows = [["date", "exercise", "set", "weight_kg", "reps", "rpe", "warmup", "note"], ...sets.map((s) => [s.createdAt, names.get(s.exerciseId) ?? s.exerciseId, s.setIndex + 1, s.weightKg, s.reps, s.rpe ?? "", s.isWarmup, (s.note ?? "").replace(/"/g, '""')])];
    const csv = rows.map((r) => r.map((c) => `"${c}"`).join(",")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = "sets.csv";
    a.click();
  };

  return (
    <div className="page stack">
      <h1>Settings</h1>

      <div className="card stack">
        <h2>Profile</h2>
        <label className="field">Display name<input value={name} onChange={(e) => setName(e.target.value)} onBlur={() => saveProfile({ displayName: name })} /></label>
        <div className="row">
          <span className="muted small">Unit</span>
          <div className="segmented">
            {(["lb", "kg"] as Unit[]).map((u) => <button key={u} className={profile.unit === u ? "on" : ""} onClick={() => saveProfile({ unit: u })}>{u}</button>)}
          </div>
        </div>
        <label className="field">Timezone (decides "today" in weekly mode)<input value={tz} onChange={(e) => setTz(e.target.value)} onBlur={() => saveProfile({ timezone: tz })} /></label>
      </div>

      <div className="card stack">
        <h2>Theme</h2>
        <div className="row">
          {Object.entries(THEME_PRESETS).map(([id, t]) => (
            <button key={id} className={`btn sm ${cfg.theme.preset === id ? "active" : ""}`} onClick={() => patch({ theme: { preset: id, vars: {} } }, `Theme: ${t.label}`)}>
              <span style={{ display: "inline-block", width: 12, height: 12, borderRadius: 6, background: t.vars.accent, marginRight: 6, verticalAlign: "middle", boxShadow: `6px 0 0 ${t.vars.highlight}` }} />
              {"  "}{t.label}
            </button>
          ))}
        </div>
        <div className="grid2">
          {colorKeys.map((k) => (
            <label key={k} className="row small" style={{ justifyContent: "space-between", background: "var(--surface-2)", padding: "6px 10px", borderRadius: 12 }}>
              {k}
              <input type="color" value={themeVars[k]} onChange={(e) => patch({ theme: { vars: { ...cfg.theme.vars, [k]: e.target.value } } })} style={{ padding: 0, width: 40, minHeight: 28, border: 0, background: "none" }} />
            </label>
          ))}
        </div>
        <div className="small">
          {CONTRAST_PAIRS.map(([fg, bg]) => {
            const r = contrastRatio(themeVars[fg] ?? "", themeVars[bg] ?? "");
            return r == null ? null : (
              <div key={fg + bg} style={{ color: r >= 4.5 ? "var(--good)" : "var(--bad)" }}>
                {fg} on {bg}: {r.toFixed(1)}:1 {r >= 4.5 ? "✓" : "— below 4.5:1, hard to read"}
              </div>
            );
          })}
        </div>
        <button className="btn sm" onClick={() => patch({ theme: { vars: {} } }, "Theme colors reset")} style={{ justifySelf: "start" }}>Reset colors to preset</button>
      </div>

      <div className="card stack">
        <h2>Dashboard widgets</h2>
        <label className="row small"><input type="checkbox" checked={cfg.dashboard.enabled} onChange={(e) => patch({ dashboard: { enabled: e.target.checked } })} /> Show dashboard on Today</label>
        <ul className="setlist">
          {widgets.map((w, i) => (
            <li key={w.id} style={{ flexWrap: "wrap" }}>
              <input type="checkbox" checked={w.enabled} onChange={(e) => updWidget(i, { enabled: e.target.checked })} aria-label={`Show ${WIDGET_LABEL[w.id]}`} />
              <span className="grow">{WIDGET_LABEL[w.id]}</span>
              <select value={w.size} onChange={(e) => updWidget(i, { size: Number(e.target.value) as 1 | 2 })} aria-label="Size">
                <option value={1}>Half</option>
                <option value={2}>Full</option>
              </select>
              <select value={NAMED_COLORS.includes(w.color) ? w.color : "custom"} onChange={(e) => updWidget(i, { color: e.target.value === "custom" ? "#ff7a59" : e.target.value })} aria-label="Color">
                <option value="surface">Plain</option>
                <option value="hero">Highlight</option>
                <option value="lime">Accent</option>
                <option value="custom">Custom…</option>
              </select>
              {!NAMED_COLORS.includes(w.color) && <input type="color" value={/^#[0-9a-f]{6}$/i.test(w.color) ? w.color : "#ff7a59"} onChange={(e) => updWidget(i, { color: e.target.value })} style={{ padding: 0, width: 36, minHeight: 28 }} />}
              <button className="btn sm ghost" onClick={() => moveWidget(i, -1)} aria-label="Move up">↑</button>
              <button className="btn sm ghost" onClick={() => moveWidget(i, 1)} aria-label="Move down">↓</button>
            </li>
          ))}
        </ul>
        <label className="field">Weekly session target<input type="number" min={1} value={cfg.dashboard.weeklyTarget} onChange={(e) => patch({ dashboard: { weeklyTarget: Math.max(1, Number(e.target.value) || 1) } })} /></label>
      </div>

      <div className="card stack">
        <h2>Config (debug)</h2>
        <p className="muted small">
          Everything in <code>src/config/app.config.ts</code> can be overridden here. Only what you put in this JSON changes; it's saved in this browser.
          Add <code>?debug=1</code> to any URL for the debug panel (time travel, state dump).
        </p>
        <div className="row">
          <button className="btn sm" onClick={() => patch({ debug: { panel: !cfg.debug.panel } })}>Debug panel: {cfg.debug.panel ? "on" : "off"}</button>
          <button className="btn sm" onClick={() => patch({ debug: { logStore: !cfg.debug.logStore } })}>Log store calls: {cfg.debug.logStore ? "on" : "off"}</button>
          <button className="btn sm" onClick={() => patch({ restTimer: { defaultSeconds: 5, byCategory: { upper: 5, lower: 5, core: 5, cardio: 0, other: 5 } } }, "Rest timer set to 5s")}>5s rest timer</button>
        </div>
        <textarea rows={12} value={json} onChange={(e) => setJson(e.target.value)} spellCheck={false} aria-label="Config overrides JSON" />
        {jsonErr && <div className="small" style={{ color: "var(--bad)" }}>{jsonErr}</div>}
        <div className="row">
          <button className="btn primary" onClick={() => { try { const v = JSON.parse(json || "{}"); setJsonErr(null); const prev = overrides ?? null; setOverrides(v); toast.show({ text: "Config applied", undo: () => setOverrides(prev) }); } catch (e) { setJsonErr(String(e)); } }}>Apply</button>
          <button className="btn" onClick={() => { const prev = overrides ?? null; setOverrides(null); toast.show({ text: "Overrides cleared", undo: () => setOverrides(prev) }); }}>Reset to defaults</button>
        </div>
        <details>
          <summary className="muted small">Defaults reference</summary>
          <pre className="code">{JSON.stringify(defaultConfig, null, 2)}</pre>
        </details>
      </div>

      <div className="card stack">
        <h2>Data</h2>
        <p className="muted small">Backend: <strong>{store.kind}</strong>{store.kind === "local" && " (this browser only)"}</p>
        <div className="row">
          <button className="btn" onClick={download}>Export JSON</button>
          <button className="btn" onClick={downloadCsv}>Export CSV</button>
          {store.kind === "local" && (
            <label className="btn">
              Import JSON
              <input type="file" accept="application/json" hidden onChange={async (e) => { const f = e.target.files?.[0]; if (!f) return; await store.importAll(JSON.parse(await f.text())); toast.show({ text: "Imported" }); refresh(); }} />
            </label>
          )}
          <button className="btn" onClick={async () => { try { const n = await generateDemoHistory(store, cfg, now()); toast.show({ text: `Generated ${n} demo sessions` }); refresh(); } catch (e) { toast.show({ text: String(e) }); } }}>Generate demo history</button>
          <button className="btn danger" onClick={async () => { const backup = await store.exportAll(); await store.resetAll(); toast.show({ text: "All data reset", undo: store.kind === "local" ? async () => { await store.importAll(backup); refresh(); } : undefined }); refresh(); }}>Reset all data</button>
          {store instanceof SupabaseStore && <button className="btn" onClick={async () => { await store.sb.auth.signOut(); location.reload(); }}>Sign out</button>}
        </div>
      </div>
      <p className="muted small">Auto-progression suggestions are conservative and not medical advice.</p>
      {toast.node}
    </div>
  );
}
