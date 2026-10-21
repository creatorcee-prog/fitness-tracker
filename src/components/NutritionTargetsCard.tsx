"use client";

import { useEffect, useState } from "react";
import { useApp } from "./AppProvider";

/** Settings → Nutrition: daily calorie and protein targets. */
export function NutritionTargetsCard() {
  const { cfg, store, version } = useApp();
  const [kcal, setKcal] = useState("");
  const [protein, setProtein] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    store.getNutritionTargets().then((t) => {
      setKcal(t.calories ? String(t.calories) : "");
      setProtein(t.protein ? String(t.protein) : "");
    }).catch(() => {});
  }, [store, version]);

  const save = async () => {
    await store.setNutritionTargets({ calories: kcal ? Number(kcal) : null, protein: protein ? Number(protein) : null });
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  };

  return (
    <div className="card stack">
      <h2>Nutrition</h2>
      <div className="row">
        <label className="field" style={{ flex: 1 }}>Daily calories<input inputMode="numeric" placeholder={String(cfg.nutrition.defaultCalorieTarget)} value={kcal} onChange={(e) => setKcal(e.target.value.replace(/[^\d]/g, ""))} onBlur={save} /></label>
        <label className="field" style={{ flex: 1 }}>Protein (g)<input inputMode="numeric" placeholder="optional" value={protein} onChange={(e) => setProtein(e.target.value.replace(/[^\d]/g, ""))} onBlur={save} /></label>
      </div>
      <p className="muted small">{saved ? "Saved ✓" : "Log food from the Calories card on Today. Targets are a guide, not medical advice."}</p>
    </div>
  );
}
