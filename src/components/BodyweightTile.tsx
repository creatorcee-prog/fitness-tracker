"use client";

import { useEffect, useState } from "react";
import { bodyweightTrend, type BodyweightEntry } from "@/lib/domain/bodyweight";
import { localDate } from "@/lib/domain/split";
import { formatWeight, fromKg, toKg } from "@/lib/domain/units";
import { useApp } from "./AppProvider";

/** Today widget: latest bodyweight + weekly trend, logged right on the tile. */
export function BodyweightTile() {
  const { cfg, store, profile, version, now, refresh } = useApp();
  const [entries, setEntries] = useState<BodyweightEntry[]>([]);
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const today = localDate(now(), profile.timezone);
  useEffect(() => {
    void store.listBodyweight().then(setEntries).catch(() => setEntries([]));
  }, [store, version]);
  const tr = bodyweightTrend(entries, today);
  const unit = profile.unit;

  const save = async () => {
    const kg = toKg(Number(value), unit);
    if (!(kg >= 25 && kg <= 300)) return;
    const optimistic = [...entries.filter((e) => e.date !== today), { date: today, weightKg: kg }];
    setEntries(optimistic); // show it now; the save follows
    setOpen(false);
    setValue("");
    await store.logBodyweight({ date: today, weightKg: kg }).catch(() => store.listBodyweight().then(setEntries));
    refresh();
  };

  return (
    <>
      <div className="spread"><span className="label">Bodyweight</span>
        {!open && <button className="btn sm" aria-label="Log today's bodyweight" onClick={() => setOpen(true)}>+ Log</button>}
      </div>
      {open ? (
        <form className="row" style={{ gap: 6, flexWrap: "nowrap" }} onSubmit={(e) => { e.preventDefault(); void save(); }}>
          <input autoFocus inputMode="decimal" style={{ width: 0, flex: 1 }} placeholder={unit} value={value} onChange={(e) => setValue(e.target.value.replace(/[^\d.]/g, ""))} aria-label={`Bodyweight in ${unit}`} />
          <button className="btn sm primary" type="submit" disabled={!value}>Save</button>
        </form>
      ) : (
        <>
          <span className="value">{tr.latest ? Number(fromKg(tr.latest.weightKg, unit).toFixed(1)) : "—"}<small> {unit}</small></span>
          <span className="foot">
            {tr.perWeek != null ? `${tr.perWeek >= 0 ? "+" : "−"}${Math.abs(Number(fromKg(tr.perWeek, unit).toFixed(1)))} ${unit}/wk` : tr.avg7 != null ? `7-day avg ${formatWeight(tr.avg7, unit, cfg.units.displayDecimals)}` : "Log a few mornings a week"}
          </span>
        </>
      )}
    </>
  );
}
