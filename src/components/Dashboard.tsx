"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import type { WidgetConfig, WidgetId } from "@/config/app.config";
import { LAYOUT_PRESETS, WIDGET_INFO } from "@/config/layouts";
import { deepMerge } from "@/config/runtime";
import type { BodyweightEntry } from "@/lib/domain/bodyweight";
import { buildWidgetData } from "@/lib/widgets/data";
import { MAX_CODE_CHARS, WIDGET_TEMPLATE } from "@/lib/widgets/sandbox";
import { uid } from "@/lib/store/local";
import { BodyweightTile } from "./BodyweightTile";
import { CustomWidget } from "./CustomWidget";
import { useToast } from "./UndoToast";
import { e1rm } from "@/lib/domain/e1rm";
import { replayPRs } from "@/lib/domain/prs";
import type { Today } from "@/lib/domain/split";
import { finishedBetween, volumeKg, weekStart, freezeRules, streakInfo } from "@/lib/domain/stats";
import type { Exercise, FriendStatus, PREvent, Session, SetEntry } from "@/lib/domain/types";
import { formatWeight } from "@/lib/domain/units";
import { defaultConfig } from "@/config/app.config";
import { useApp } from "./AppProvider";
import { CaloriesCard } from "./CaloriesCard";
import { GoalsWidget } from "./GoalsWidget";
import { Ring } from "./Ring";

interface Data {
  sessions: Session[];
  sets: SetEntry[];
  exercises: Map<string, Exercise>;
  latestPr: PREvent | null;
  friends: FriendStatus[];
  bodyweight: BodyweightEntry[];
  dayNames: Map<string, string>;
}

const LONG_PRESS_MS = 550;
/** Tapping a widget opens the page it summarises. */
const TILE_LINK: Partial<Record<string, string>> = {
  week: "/progress", streak: "/progress", lastPr: "/progress", topLift: "/progress", volume: "/progress",
  bodyweight: "/progress#bodyweight", goals: "/progress#goals",
};
const labelOf = (w: WidgetConfig) => w.custom?.title ?? WIDGET_INFO[w.id]?.label ?? w.id;

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

export function Dashboard({ today, onFocusWorkout, hide = [] }: { today: Today | null; onFocusWorkout?: () => void; hide?: WidgetConfig["id"][] }) {
  const { cfg, store, profile, version, now, overrides, setOverrides } = useApp();
  const [data, setData] = useState<Data | null>(null);
  const toast = useToast(cfg.logging.undoToastMs);
  const router = useRouter();

  useEffect(() => {
    (async () => {
      const [sessions, sets, exList, friends, bodyweight, splits] = await Promise.all([
        store.listSessions(),
        store.listSets(),
        store.listExercises(),
        cfg.friends.enabled ? store.friendsToday(now()).catch(() => []) : Promise.resolve([]),
        store.listBodyweight().catch(() => []),
        store.listSplits().catch(() => []),
      ]);
      const byEx = new Map<string, SetEntry[]>();
      for (const s of sets) byEx.set(s.exerciseId, [...(byEx.get(s.exerciseId) ?? []), s]);
      let latestPr: PREvent | null = null;
      for (const exSets of byEx.values()) {
        for (const e of replayPRs(exSets, sessions, cfg)) {
          if (!e.baseline && e.type !== "session_volume" && (!latestPr || e.achievedAt > latestPr.achievedAt)) latestPr = e;
        }
      }
      const dayNames = new Map(splits.flatMap((sp) => sp.days.map((d) => [d.id, d.name] as [string, string])));
      setData({ sessions, sets, exercises: new Map(exList.map((e) => [e.id, e])), latestPr, friends, bodyweight, dayNames });
    })();
  }, [store, cfg, version, now]);

  // ---------------------------------------------------------------- edit mode (like Control Center)
  const [editing, setEditing] = useState(false);
  const [sheet, setSheet] = useState<null | "add" | { code: WidgetConfig }>(null);
  const [draft, setDraft] = useState<WidgetConfig[] | null>(null); // live order while dragging
  const all = draft ?? withNewWidgets(cfg.dashboard.widgets);
  const save = (list: WidgetConfig[]) => setOverrides(deepMerge((overrides ?? {}) as Record<string, unknown>, { dashboard: { widgets: list } }));
  /** Change the layout, with Undo (removing a tile never asks "are you sure?"). */
  const change = (list: WidgetConfig[], text?: string) => {
    const prev = withNewWidgets(cfg.dashboard.widgets);
    save(list);
    if (text) toast.show({ text, undo: () => save(prev) });
  };
  const visibleIds = (list: WidgetConfig[]) => list.filter((w) => w.enabled && !hide.includes(w.id)).map((w) => w.id);
  const move = (id: WidgetId, dir: -1 | 1) => {
    const vis = visibleIds(all);
    const other = vis[vis.indexOf(id) + dir];
    if (!other) return;
    const list = [...all];
    const a = list.findIndex((w) => w.id === id), b = list.findIndex((w) => w.id === other);
    [list[a], list[b]] = [list[b], list[a]];
    change(list);
  };
  const remove = (w: WidgetConfig) =>
    change(w.custom ? all.filter((x) => x.id !== w.id) : all.map((x) => (x.id === w.id ? { ...x, enabled: false } : x)), `Removed ${labelOf(w)}`);
  const add = (id: WidgetId) => {
    const target = all.find((x) => x.id === id);
    if (!target) return;
    change([...all.filter((x) => x.id !== id), { ...target, enabled: true }]);
    setSheet(null);
  };
  const applyLayout = (preset: (typeof LAYOUT_PRESETS)[number]) => {
    const ids = new Set(preset.widgets.map((w) => w.id));
    change([...preset.widgets, ...all.filter((w) => !ids.has(w.id)).map((w) => ({ ...w, enabled: false }))], `Layout: ${preset.label}`);
    setSheet(null);
  };

  // Press and hold a tile to start editing (a visible Edit button does the same).
  const press = useRef<{ timer: ReturnType<typeof setTimeout>; x: number; y: number; fired: boolean } | null>(null);
  const holdStart = (e: React.PointerEvent) => {
    if (editing) return;
    const p = { x: e.clientX, y: e.clientY, fired: false, timer: setTimeout(() => {
      p.fired = true;
      setEditing(true);
      if ("vibrate" in navigator) navigator.vibrate?.(10);
    }, LONG_PRESS_MS) };
    press.current = p;
  };
  const holdMove = (e: React.PointerEvent) => {
    const p = press.current;
    if (p && !p.fired && Math.hypot(e.clientX - p.x, e.clientY - p.y) > 8) clearTimeout(p.timer); // it's a scroll
  };
  const holdEnd = () => {
    const p = press.current;
    if (!p) return;
    clearTimeout(p.timer);
    // The click that follows this release is the only one to swallow; forget it right after.
    if (p.fired) setTimeout(() => press.current === p && (press.current = null), 50);
    else press.current = null;
  };
  // The tap that ends a long-press shouldn't also open the tile.
  const swallowClick = (e: React.MouseEvent) => {
    if (press.current?.fired) {
      e.preventDefault();
      e.stopPropagation();
      press.current = null;
    }
  };

  // Drag to reorder while editing (↑/↓ buttons do the same without dragging).
  const drag = useRef<WidgetId | null>(null);
  const dragStart = (e: React.PointerEvent, id: WidgetId) => {
    if (!editing || (e.target as HTMLElement).closest("button")) return;
    drag.current = id;
    setDraft(all);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const dragMove = (e: React.PointerEvent) => {
    if (!drag.current || !draft) return;
    const over = (document.elementsFromPoint(e.clientX, e.clientY).find((el) => (el as HTMLElement).dataset?.wid && (el as HTMLElement).dataset.wid !== drag.current) as HTMLElement | undefined)?.dataset.wid;
    if (!over) return;
    const list = [...draft];
    const from = list.findIndex((w) => w.id === drag.current), to = list.findIndex((w) => w.id === over);
    const [item] = list.splice(from, 1);
    list.splice(to, 0, item);
    setDraft(list);
  };
  const dragEnd = () => {
    if (drag.current && draft) save(draft);
    drag.current = null;
    setDraft(null);
  };

  const widgetData = useMemo(
    () => (data ? buildWidgetData({ cfg, unit: profile.unit, now: now(), today, sessions: data.sessions, sets: data.sets, exercises: data.exercises, bodyweight: data.bodyweight, dayNames: data.dayNames }) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data, cfg, profile.unit, today],
  );

  if (!cfg.dashboard.enabled) return null;
  const widgets = all.filter((w) => w.enabled && !hide.includes(w.id));
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
        const st = data ? streakInfo(data.sessions, t, cfg.split.weekStartsOn, target, freezeRules(cfg)) : { weeks: 0, freezes: 0, frozen: 0 };
        return (
          <>
            <span className="label">Streak{st.freezes > 0 && <span title="A freeze covers one missed week so your streak doesn't reset."> · 🧊 {st.freezes}</span>}</span>
            <span className="value">{st.weeks}<small> wk</small></span>
            <Bar v={done} of={target} />
            <span className="foot">{done >= target ? "This week counts ✓" : st.freezes > 0 ? `${target - done} more · a freeze covers a missed week` : `${target - done} more to keep it going`}</span>
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
      case "bodyweight":
        return <BodyweightTile />;
      case "goals":
        return <GoalsWidget />;
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
      default:
        return w.custom ? <CustomWidget code={w.custom.code} title={w.custom.title} data={widgetData} inert={editing} /> : null;
    }
  };


  const hidden = all.filter((w) => !w.enabled && !hide.includes(w.id));
  return (
    <div className="stack" style={{ gap: 10 }}>
      <div className="spread">
        <span className="today-section-title" style={{ margin: 0 }}>Widgets</span>
        {editing ? (
          <div className="row" style={{ gap: 6 }}>
            <button className="btn sm" onClick={() => setSheet("add")}>+ Add</button>
            <button className="btn sm primary" onClick={() => setEditing(false)}>Done</button>
          </div>
        ) : (
          <button className="btn sm ghost" onClick={() => setEditing(true)} aria-label="Edit widgets">Edit</button>
        )}
      </div>

      <div className={`grid2 widgets ${editing ? "editing" : ""}`} style={{ gridTemplateColumns: "1fr 1fr" }} onPointerMove={dragMove} onPointerUp={dragEnd} onPointerCancel={dragEnd}>
        {widgets.map((w, i) => {
          const { className, style } = tileStyle(w);
          return (
            <div
              key={w.id}
              data-wid={w.id}
              className={`${className} widget ${drag.current === w.id ? "dragging" : ""}`}
              style={{ ...style, animationDelay: `${(i % 3) * -0.13}s` }}
              onPointerDown={(e) => (editing ? dragStart(e, w.id) : holdStart(e))}
              onPointerMove={holdMove}
              onPointerUp={holdEnd}
              onPointerLeave={holdEnd}
              onClickCapture={swallowClick}
              role={!editing && TILE_LINK[w.id] ? "link" : undefined}
              tabIndex={!editing && TILE_LINK[w.id] ? 0 : undefined}
              aria-label={!editing && TILE_LINK[w.id] ? `${labelOf(w)}: open details` : undefined}
              onClick={(e) => {
                // Buttons and inputs on the tile (+ Add, + Log) do their own thing.
                if (editing || !TILE_LINK[w.id] || (e.target as HTMLElement).closest("button, a, input, select, textarea, form")) return;
                router.push(TILE_LINK[w.id]!);
              }}
              onKeyDown={(e) => !editing && TILE_LINK[w.id] && e.key === "Enter" && router.push(TILE_LINK[w.id]!)}
              onContextMenu={(e) => e.preventDefault()}
            >
              <div className="widget-body" inert={editing || undefined}>{render(w)}</div>
              {editing && (
                <>
                  <button className="widget-remove" aria-label={`Remove ${labelOf(w)}`} onClick={() => remove(w)}>−</button>
                  <div className="widget-tools">
                    <button className="btn sm" aria-label={`Move ${labelOf(w)} up`} disabled={i === 0} onClick={() => move(w.id, -1)}>↑</button>
                    <button className="btn sm" aria-label={`Move ${labelOf(w)} down`} disabled={i === widgets.length - 1} onClick={() => move(w.id, 1)}>↓</button>
                    <button className="btn sm" aria-label={`Make ${labelOf(w)} ${w.size === 2 ? "half" : "full"} width`} onClick={() => change(all.map((x) => (x.id === w.id ? { ...x, size: w.size === 2 ? 1 : 2 } : x)))}>{w.size === 2 ? "½" : "Full"}</button>
                    {w.custom && <button className="btn sm" onClick={() => setSheet({ code: w })}>Code</button>}
                  </div>
                </>
              )}
            </div>
          );
        })}
        {editing && (
          <button className="tile widget-add" onClick={() => setSheet("add")}>+ Add a widget</button>
        )}
      </div>

      {sheet === "add" && (
        <div className="sheet-backdrop" onClick={() => setSheet(null)}>
          <div className="sheet" role="dialog" aria-label="Add a widget" onClick={(e) => e.stopPropagation()}>
            <div className="spread"><h2 style={{ margin: 0 }}>Add a widget</h2><button className="btn sm ghost" onClick={() => setSheet(null)} aria-label="Close">✕</button></div>
            {hidden.length > 0 ? hidden.map((w) => (
              <button key={w.id} className="sheet-item" onClick={() => add(w.id)}>
                <strong>{labelOf(w)}</strong>
                <span className="muted small">{w.custom ? "Your widget" : WIDGET_INFO[w.id]?.description}</span>
              </button>
            )) : <p className="muted small">Every widget is already on Today.</p>}
            <button className="sheet-item" onClick={() => setSheet({ code: { id: `custom:${uid()}`, enabled: true, size: 2, color: "surface", custom: { title: "My widget", code: WIDGET_TEMPLATE } } })}>
              <strong>✎ Make your own</strong>
              <span className="muted small">Write a widget in HTML/JavaScript. It runs sandboxed: no internet, no access to your account.</span>
            </button>
            <h3 style={{ margin: "8px 0 0" }}>Layouts</h3>
            {LAYOUT_PRESETS.map((p) => (
              <button key={p.id} className="sheet-item" onClick={() => applyLayout(p)}>
                <strong>{p.label}</strong>
                <span className="muted small">{p.description}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {sheet && typeof sheet === "object" && (
        <CodeEditor
          widget={sheet.code}
          data={widgetData}
          onCancel={() => setSheet(null)}
          onSave={(w) => {
            const exists = all.some((x) => x.id === w.id);
            change(exists ? all.map((x) => (x.id === w.id ? w : x)) : [...all, w]);
            setSheet(null);
          }}
        />
      )}
      {toast.node}
    </div>
  );
}

/** Write or edit a custom widget, with a live preview in the same sandbox it will run in. */
function CodeEditor({ widget, data, onSave, onCancel }: { widget: WidgetConfig; data: ReturnType<typeof buildWidgetData> | null; onSave: (w: WidgetConfig) => void; onCancel: () => void }) {
  const [title, setTitle] = useState(widget.custom?.title ?? "My widget");
  const [code, setCode] = useState(widget.custom?.code ?? "");
  const [preview, setPreview] = useState(code);
  // Re-render the preview shortly after typing stops.
  useEffect(() => {
    const t = setTimeout(() => setPreview(code), 600);
    return () => clearTimeout(t);
  }, [code]);
  return (
    <div className="sheet-backdrop" onClick={onCancel}>
      <div className="sheet" role="dialog" aria-label="Edit custom widget" onClick={(e) => e.stopPropagation()}>
        <div className="spread"><h2 style={{ margin: 0 }}>Custom widget</h2><button className="btn sm ghost" onClick={onCancel} aria-label="Close">✕</button></div>
        <label className="field">Title<input value={title} maxLength={40} onChange={(e) => setTitle(e.target.value)} /></label>
        <label className="field">Code (HTML, CSS, JavaScript)
          <textarea className="code-input" rows={12} value={code} maxLength={MAX_CODE_CHARS} spellCheck={false} autoCapitalize="off" autoCorrect="off" onChange={(e) => setCode(e.target.value)} />
        </label>
        <div className="muted small">{code.length.toLocaleString()} / {MAX_CODE_CHARS.toLocaleString()} · Runs sandboxed: it can read your training data but can&apos;t reach the internet, your account or the rest of the app. Only paste code you understand.</div>
        <div className="tile" style={{ padding: 12 }}>
          <span className="label">Preview</span>
          <CustomWidget code={preview} title={title} data={data} />
        </div>
        <div className="row">
          <button className="btn primary" disabled={!title.trim() || !code.trim()} onClick={() => onSave({ ...widget, enabled: true, custom: { title: title.trim(), code } })}>Save</button>
          <button className="btn" onClick={onCancel}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
