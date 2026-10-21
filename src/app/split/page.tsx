"use client";

import { useEffect, useState } from "react";
import type { Category } from "@/config/app.config";
import { useApp } from "@/components/AppProvider";
import { useToast } from "@/components/UndoToast";
import type { Exercise, Split, SplitState } from "@/lib/domain/types";
import { toKg } from "@/lib/domain/units";
import { uid } from "@/lib/store/local";
import { starterSplitFor } from "@/lib/store/seed";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const CATEGORIES: Category[] = ["upper", "lower", "core", "cardio", "other"];

export default function SplitPage() {
  const { cfg, store, profile, version, refresh } = useApp();
  const [splits, setSplits] = useState<Split[]>([]);
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [state, setState] = useState<SplitState | null>(null);
  const [editing, setEditing] = useState<Split | null>(null);
  const [newEx, setNewEx] = useState({ name: "", category: "upper" as Category, increment: "" });
  const toast = useToast(cfg.logging.undoToastMs);

  useEffect(() => {
    (async () => {
      const [s, e, st] = await Promise.all([store.listSplits(), store.listExercises(), store.getSplitState()]);
      setSplits(s);
      setExercises(e);
      setState(st);
      setEditing((cur) => (cur ? s.find((x) => x.id === cur.id) ?? cur : s.find((x) => x.isActive) ?? s[0] ?? null));
    })();
  }, [store, version]);

  const save = async (s: Split) => {
    const prev = splits.find((x) => x.id === s.id);
    const normalized = { ...s, days: s.days.map((d, i) => ({ ...d, position: i, exercises: d.exercises.map((x, j) => ({ ...x, order: j })) })) };
    await store.saveSplit(normalized);
    toast.show({ text: "Split saved", undo: prev ? async () => { await store.saveSplit(prev); refresh(); } : undefined });
    refresh();
  };

  const newSplit = () => {
    const id = uid();
    setEditing({ id, name: "New split", mode: cfg.split.defaultMode, isActive: splits.length === 0, days: [{ id: uid(), splitId: id, position: 0, name: "Day A", weekday: 1, exercises: [] }] });
  };

  const starter = async () => {
    const s = starterSplitFor(exercises, uid);
    s.mode = cfg.split.defaultMode;
    s.isActive = true;
    await store.saveSplit(s);
    refresh();
  };

  const addExercise = async () => {
    if (!newEx.name.trim()) return;
    const inc = Number(newEx.increment);
    await store.createExercise({ name: newEx.name.trim(), category: newEx.category, equipment: null, incrementKg: newEx.increment && inc > 0 ? toKg(inc, profile.unit) : null });
    setNewEx({ name: "", category: newEx.category, increment: "" });
    refresh();
  };

  const e = editing;
  const upd = (patch: Partial<Split>) => e && setEditing({ ...e, ...patch });
  const updDay = (i: number, patch: Partial<Split["days"][number]>) => e && upd({ days: e.days.map((d, j) => (j === i ? { ...d, ...patch } : d)) });
  const move = <T,>(arr: T[], i: number, d: number) => {
    const out = [...arr];
    const j = i + d;
    if (j < 0 || j >= out.length) return out;
    [out[i], out[j]] = [out[j], out[i]];
    return out;
  };

  return (
    <div className="page stack">
      <div className="spread">
        <h1>Split</h1>
        <div className="row">
          <button className="btn sm" onClick={newSplit}>+ New</button>
          {splits.length === 0 && <button className="btn sm primary" onClick={starter}>Starter PPL</button>}
        </div>
      </div>

      {splits.length > 1 && (
        <div className="segmented" style={{ overflowX: "auto", maxWidth: "100%" }}>
          {splits.map((s) => <button key={s.id} className={e?.id === s.id ? "on" : ""} onClick={() => setEditing(s)}>{s.name}{s.isActive ? " ★" : ""}</button>)}
        </div>
      )}

      {e && (
        <div className="card stack">
          <label className="field">Name<input value={e.name} onChange={(x) => upd({ name: x.target.value })} /></label>
          <div className="row">
            <div className="segmented">
              <button className={e.mode === "rotation" ? "on" : ""} onClick={() => upd({ mode: "rotation" })}>Rotation</button>
              <button className={e.mode === "weekly" ? "on" : ""} onClick={() => upd({ mode: "weekly" })}>Weekly</button>
            </div>
            <label className="row small"><input type="checkbox" checked={e.isActive} onChange={(x) => upd({ isActive: x.target.checked })} /> Active</label>
          </div>
          <p className="muted small">
            {e.mode === "rotation" ? "Rotation: the next day comes after each finished session, so a missed day never skips a workout." : "Weekly: each day is tied to a weekday; days with no workout are rest days."}
          </p>

          {e.days.map((d, i) => (
            <div key={d.id} className="card" style={{ background: "var(--surface-2)" }}>
              <div className="row">
                <input style={{ flex: 1, minWidth: 120 }} value={d.name} onChange={(x) => updDay(i, { name: x.target.value })} aria-label="Day name" />
                {e.mode === "weekly" && (
                  <select value={d.weekday ?? ""} onChange={(x) => updDay(i, { weekday: x.target.value === "" ? null : Number(x.target.value) })} aria-label="Weekday">
                    <option value="">—</option>
                    {WEEKDAYS.map((w, k) => <option key={k} value={k}>{w}</option>)}
                  </select>
                )}
                {e.isActive && e.mode === "rotation" && state?.nextPosition === d.position && <span className="pill good">Next up</span>}
                {e.isActive && e.mode === "rotation" && state?.nextPosition !== d.position && (
                  <button className="btn sm" onClick={async () => { await store.setNextPosition(d.position); refresh(); }}>Make next</button>
                )}
                <button className="btn sm" onClick={() => upd({ days: move(e.days, i, -1) })} aria-label="Move day up">↑</button>
                <button className="btn sm" onClick={() => upd({ days: move(e.days, i, 1) })} aria-label="Move day down">↓</button>
                <button className="btn sm danger" onClick={() => upd({ days: e.days.filter((_, j) => j !== i) })} aria-label="Remove day">✕</button>
              </div>
              <ul className="setlist">
                {d.exercises.map((x, k) => (
                  <li key={k}>
                    <select style={{ flex: 1, minWidth: 0 }} value={x.exerciseId} onChange={(v) => updDay(i, { exercises: d.exercises.map((y, m) => (m === k ? { ...y, exerciseId: v.target.value } : y)) })}>
                      {exercises.map((ex) => <option key={ex.id} value={ex.id}>{ex.name}</option>)}
                    </select>
                    <input style={{ width: 52 }} type="number" min={1} value={x.targetSets} onChange={(v) => updDay(i, { exercises: d.exercises.map((y, m) => (m === k ? { ...y, targetSets: Number(v.target.value) || 1 } : y)) })} aria-label="Sets" />
                    <input style={{ width: 70 }} value={x.repRange} onChange={(v) => updDay(i, { exercises: d.exercises.map((y, m) => (m === k ? { ...y, repRange: v.target.value } : y)) })} aria-label="Rep range" />
                    <button className="btn sm ghost" onClick={() => updDay(i, { exercises: move(d.exercises, k, -1) })}>↑</button>
                    <button className="btn sm ghost" onClick={() => updDay(i, { exercises: d.exercises.filter((_, m) => m !== k) })}>✕</button>
                  </li>
                ))}
              </ul>
              <button className="btn sm" style={{ marginTop: 8 }} disabled={!exercises.length} onClick={() => updDay(i, { exercises: [...d.exercises, { exerciseId: exercises[0].id, order: d.exercises.length, targetSets: cfg.logging.defaultTargetSets, repRange: cfg.logging.defaultRepRange }] })}>+ Exercise</button>
            </div>
          ))}

          <div className="row">
            <button className="btn" onClick={() => upd({ days: [...e.days, { id: uid(), splitId: e.id, position: e.days.length, name: `Day ${String.fromCharCode(65 + e.days.length)}`, weekday: null, exercises: [] }] })}>+ Day</button>
            <button className="btn primary" onClick={() => save(e)}>Save split</button>
            {splits.some((s) => s.id === e.id) && (
              <button className="btn danger" onClick={async () => { const copy = e; await store.deleteSplit(e.id); setEditing(null); toast.show({ text: "Split deleted", undo: async () => { await store.saveSplit(copy); refresh(); } }); refresh(); }}>Delete</button>
            )}
          </div>
        </div>
      )}

      <div className="card stack">
        <h2>Custom exercise</h2>
        <div className="row">
          <input style={{ flex: 1, minWidth: 140 }} placeholder="Name" value={newEx.name} onChange={(x) => setNewEx({ ...newEx, name: x.target.value })} />
          <select value={newEx.category} onChange={(x) => setNewEx({ ...newEx, category: x.target.value as Category })}>
            {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
          </select>
          <input style={{ width: 110 }} inputMode="decimal" placeholder={`Step (${profile.unit})`} value={newEx.increment} onChange={(x) => setNewEx({ ...newEx, increment: x.target.value })} />
          <button className="btn" onClick={addExercise}>Add</button>
        </div>
      </div>
      {toast.node}
    </div>
  );
}
