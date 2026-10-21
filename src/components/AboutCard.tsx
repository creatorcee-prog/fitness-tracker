"use client";

import { bmi, BMI_NOTE, EXPERIENCE, FREQUENCIES, STYLES, type About } from "@/lib/domain/about";
import { fromKg } from "@/lib/domain/units";
import { useEffect, useState } from "react";
import { useApp } from "./AppProvider";

/** Settings → You: what James knows about you (from the setup), editable, and a way to redo the setup. */
export function AboutCard() {
  const { cfg, store, profile, setProfile } = useApp();
  const a: About = profile.about ?? { style: null, frequency: null, experience: null, heightCm: null };
  const [weightKg, setWeightKg] = useState<number | null>(null);
  useEffect(() => {
    void store.listBodyweight().then((b) => setWeightKg(b.length ? b[b.length - 1].weightKg : null)).catch(() => {});
  }, [store]);
  const save = async (patch: Partial<About>) => setProfile(await store.updateProfile({ about: { ...a, ...patch } }));
  const b = bmi(a.heightCm, weightKg);
  const sel = <T extends string>(label: string, value: T | null, items: { id: T; label: string }[], key: keyof About) => (
    <label className="field">{label}
      <select value={value ?? ""} onChange={(e) => save({ [key]: e.target.value || null } as Partial<About>)}>
        <option value="">Not set</option>
        {items.map((i) => <option key={i.id} value={i.id}>{i.label}</option>)}
      </select>
    </label>
  );
  return (
    <div className="card stack">
      <h2>About you</h2>
      <p className="muted small" style={{ margin: 0 }}>{cfg.brand.botName} uses this to tailor advice and suggestions.</p>
      {sel("Training for", a.style, STYLES, "style")}
      {sel("How often", a.frequency, FREQUENCIES.map((f) => ({ id: f.id, label: `${f.label} (${f.blurb})` })), "frequency")}
      {sel("Experience", a.experience, EXPERIENCE.map((e) => ({ id: e.id, label: `${e.label} (${e.blurb})` })), "experience")}
      <label className="field">Height (cm)
        <input inputMode="numeric" defaultValue={a.heightCm ?? ""} placeholder={profile.unit === "lb" ? "e.g. 178 (5'10\")" : "e.g. 178"} onBlur={(e) => { const v = Number(e.target.value); void save({ heightCm: v >= 90 && v <= 250 ? Math.round(v) : null }); }} />
      </label>
      {b && <p className="small" style={{ margin: 0 }}>BMI <strong>{b.value}</strong> ({b.band}) at {Number(fromKg(weightKg!, profile.unit).toFixed(1))} {profile.unit}. <span className="muted">{BMI_NOTE}</span></p>}
      <button className="btn sm" style={{ justifySelf: "start" }} onClick={async () => setProfile(await store.updateProfile({ onboardedAt: null }))}>Redo setup with {cfg.brand.botName}</button>
    </div>
  );
}
