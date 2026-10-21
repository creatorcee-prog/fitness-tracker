"use client";

import { useEffect, useState } from "react";
import { detectPlateaus, type Plateau } from "@/lib/domain/plateau";
import { formatWeight } from "@/lib/domain/units";
import { useApp } from "./AppProvider";
import { JamesSilhouette } from "./JamesSilhouette";

/** Progress page: lifts that have stalled, with James's next step for each (progressive overload). */
export function PlateauCard() {
  const { cfg, store, profile, version, now } = useApp();
  const [stalls, setStalls] = useState<Plateau[] | null>(null);
  useEffect(() => {
    void Promise.all([store.listSets(), store.listExercises()]).then(([sets, ex]) => setStalls(detectPlateaus(sets, ex, now(), cfg)));
  }, [store, version, cfg, now]);
  if (!stalls?.length) return null;
  return (
    <div className="card stack" id="plateaus">
      <div className="row" style={{ gap: 10 }}>
        <JamesSilhouette mood="neutral" size={40} />
        <div>
          <h2 style={{ margin: 0 }}>Stalled lifts</h2>
          <span className="muted small">No new best for 3+ weeks. Here&apos;s how to get moving again.</span>
        </div>
      </div>
      {stalls.map((p) => (
        <div key={p.exerciseId} className="stack" style={{ gap: 2 }}>
          <div className="spread"><strong>{p.name}</strong><span className="muted small">{p.weeks} weeks · best est. 1RM {formatWeight(p.bestKg, profile.unit, 0)}</span></div>
          <span className="small">{p.advice}</span>
        </div>
      ))}
    </div>
  );
}
