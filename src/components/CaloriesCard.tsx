"use client";

import { useCallback, useEffect, useState } from "react";
import { localDate } from "@/lib/domain/split";
import type { NutritionEntry, NutritionTargets } from "@/lib/domain/types";
import { useApp } from "./AppProvider";
import { useToast } from "./UndoToast";

const DAY = 86_400_000;

/** Calorie intake for today: quick-add chips, optional protein, target bar and a 7-day view. */
export function CaloriesCard() {
  const { cfg, store, profile, now, version } = useApp();
  const toast = useToast(cfg.logging.undoToastMs);
  const [entries, setEntries] = useState<NutritionEntry[]>([]);
  const [targets, setTargets] = useState<NutritionTargets>({ calories: null, protein: null });
  const [open, setOpen] = useState(false);
  const [kcal, setKcal] = useState("");
  const [protein, setProtein] = useState("");
  const [error, setError] = useState<string | null>(null);

  const today = localDate(now(), profile.timezone);
  const days = Array.from({ length: 7 }, (_, i) => localDate(new Date(now().getTime() - (6 - i) * DAY), profile.timezone));

  const load = useCallback(async () => {
    try {
      const [e, t] = await Promise.all([store.listNutrition(days[0], today), store.getNutritionTargets()]);
      setEntries(e);
      setTargets(t);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store, today]);

  useEffect(() => {
    void load();
  }, [load, version]);

  const add = async (calories: number, proteinG: number | null = null) => {
    if (!(calories > 0)) return;
    try {
      const row = await store.addNutrition({ date: today, calories: Math.round(calories), proteinG, note: null });
      toast.show({ text: `+${Math.round(calories)} kcal`, undo: async () => { await store.deleteNutrition(row.id); await load(); } });
      setKcal("");
      setProtein("");
      await load();
    } catch (e) {
      toast.show({ text: e instanceof Error ? e.message : String(e) });
    }
  };

  const todays = entries.filter((e) => e.date === today);
  const total = todays.reduce((a, e) => a + e.calories, 0);
  const prot = todays.reduce((a, e) => a + (e.proteinG ?? 0), 0);
  const target = targets.calories ?? cfg.nutrition.defaultCalorieTarget;
  const perDay = days.map((d) => entries.filter((e) => e.date === d).reduce((a, e) => a + e.calories, 0));
  const max = Math.max(target, ...perDay, 1);

  return (
    <div style={{ display: "grid", gap: 8 }}>
      <div className="spread">
        <span className="label">Calories today</span>
        <button className="chip" onClick={() => setOpen(!open)} aria-expanded={open}>{open ? "Done" : "+ Add"}</button>
      </div>
      {error ? (
        <span className="foot">{error}</span>
      ) : (
        <>
          <span className="value">
            {total.toLocaleString()}
            <small> / {target.toLocaleString()} kcal</small>
          </span>
          <div className="bar" aria-label={`${total} of ${target} calories`}>
            <i style={{ width: `${Math.min(100, (total / target) * 100)}%`, background: total > target * 1.1 ? "var(--pr)" : undefined }} />
          </div>
          <span className="foot">
            {total <= target ? `${(target - total).toLocaleString()} left` : `${(total - target).toLocaleString()} over`}
            {(prot > 0 || targets.protein) && ` · protein ${Math.round(prot)}${targets.protein ? `/${targets.protein}` : ""} g`}
          </span>
        </>
      )}

      {open && (
        <div style={{ display: "grid", gap: 8, marginTop: 4 }}>
          <div className="row">
            {cfg.nutrition.quickAdd.map((n) => (
              <button key={n} className="chip" onClick={() => add(n)}>+{n}</button>
            ))}
          </div>
          <form className="row" onSubmit={(e) => { e.preventDefault(); void add(Number(kcal), protein ? Number(protein) : null); }}>
            <input style={{ width: 100 }} inputMode="numeric" placeholder="kcal" value={kcal} onChange={(e) => setKcal(e.target.value.replace(/[^\d]/g, ""))} aria-label="Calories" />
            <input style={{ width: 110 }} inputMode="decimal" placeholder="protein g" value={protein} onChange={(e) => setProtein(e.target.value.replace(/[^\d.]/g, ""))} aria-label="Protein grams" />
            <button className="btn primary sm" type="submit" disabled={!kcal}>Add</button>
          </form>
          {todays.length > 0 && (
            <ul className="setlist" style={{ marginTop: 0 }}>
              {todays.map((e) => (
                <li key={e.id}>
                  <span className="grow">{e.calories} kcal{e.proteinG ? ` · ${e.proteinG} g protein` : ""}</span>
                  <span className="muted small">{new Date(e.createdAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</span>
                  <button className="btn sm ghost" aria-label="Delete entry" onClick={async () => { await store.deleteNutrition(e.id); await load(); }}>✕</button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 6, alignItems: "end", height: 54, marginTop: 4 }} aria-label="Last 7 days">
        {perDay.map((v, i) => (
          <div key={days[i]} title={`${days[i]}: ${v} kcal`} style={{ display: "grid", gap: 3, justifyItems: "center" }}>
            <div style={{ width: "100%", maxWidth: 22, height: Math.max(3, (v / max) * 40), borderRadius: 6, background: days[i] === today ? "var(--ring-a)" : "color-mix(in srgb, currentColor 22%, transparent)" }} />
            <span style={{ fontSize: "0.62rem", opacity: 0.6 }}>{"SMTWTFS"[new Date(days[i] + "T12:00:00").getDay()]}</span>
          </div>
        ))}
      </div>
      {toast.node}
    </div>
  );
}
