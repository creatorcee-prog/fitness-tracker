"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import type { Unit } from "@/config/app.config";
import { deepMerge } from "@/config/runtime";
import { bmi, BMI_NOTE, EXPERIENCE, FREQUENCIES, STYLES, type About, type Experience, type Frequency, type TrainingStyle } from "@/lib/domain/about";
import { localDate } from "@/lib/domain/split";
import { toKg } from "@/lib/domain/units";
import { starterTemplate, templateToSplit } from "@/lib/onboarding/templates";
import { supabaseOf } from "@/lib/store";
import { uid } from "@/lib/store/local";
import { useApp } from "./AppProvider";
import { JamesSilhouette } from "./JamesSilhouette";
import { useMascot, useTypewriter } from "./Mascot";

type Step = "name" | "style" | "frequency" | "experience" | "body" | "plan" | "discord" | "done";
type PlanChoice = "starter" | "import" | "build" | "keep" | null;

/** James asking, typed out like his other lines. */
function Ask({ text, mood = "happy" }: { text: string; mood?: "happy" | "neutral" | "proud" }) {
  const { cfg } = useApp();
  const tw = useTypewriter(text, cfg.mascot.typeMs);
  return (
    <div className="onb-ask" onClick={tw.finish}>
      <JamesSilhouette mood={mood} size={72} />
      <div className="mascot-bubble onb-bubble" aria-live="polite" aria-label={text}>
        <span aria-hidden>{tw.visible}</span>
        {!tw.done && <span className="mascot-caret" aria-hidden />}
      </div>
    </div>
  );
}

function Choice<T extends string>({ items, value, onPick }: { items: { id: T; label: string; blurb: string; emoji?: string }[]; value: T | null; onPick: (v: T) => void }) {
  return (
    <div className="onb-choices">
      {items.map((it) => (
        <button key={it.id} className={`onb-choice ${value === it.id ? "on" : ""}`} aria-pressed={value === it.id} onClick={() => onPick(it.id)}>
          {it.emoji && <span className="onb-emoji" aria-hidden>{it.emoji}</span>}
          <strong>{it.label}</strong>
          <span className="muted small">{it.blurb}</span>
        </button>
      ))}
    </div>
  );
}

/**
 * First sign-in setup: James asks a few questions (name, goal, how often,
 * experience, units and optional height/weight), suggests a starter plan or
 * sends you to Import, offers to link Discord, then gets out of the way.
 * Everything can be changed later; "Skip setup" is always there.
 */
export function Onboarding({ hasSplit, todayName, onDone }: { hasSplit: boolean; todayName?: string; onDone: () => void }) {
  const { cfg, store, profile, setProfile, overrides, setOverrides, now, refresh } = useApp();
  const mascot = useMascot();
  const router = useRouter();
  const sb = supabaseOf(store);
  const bot = cfg.brand.botName;
  const [step, setStep] = useState<Step>("name");
  const [name, setName] = useState(profile.displayName && profile.displayName !== "You" && profile.displayName !== "Lifter" ? profile.displayName : "");
  const [style, setStyle] = useState<TrainingStyle | null>(profile.about?.style ?? null);
  const [frequency, setFrequency] = useState<Frequency | null>(profile.about?.frequency ?? null);
  const [experience, setExperience] = useState<Experience | null>(profile.about?.experience ?? null);
  const [unit, setUnit] = useState<Unit>(profile.unit);
  const [height, setHeight] = useState({ cm: "", ft: "", inch: "" });
  const [weight, setWeight] = useState("");
  const [plan, setPlan] = useState<PlanChoice>(hasSplit ? "keep" : "starter");
  const [hasDiscord, setHasDiscord] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!sb) return;
    void sb.sb.auth.getUserIdentities().then(({ data }) => setHasDiscord(!!data?.identities.some((i) => i.provider === "discord")));
  }, [sb]);

  const heightCm = unit === "lb" ? (Number(height.ft) * 12 + Number(height.inch || 0)) * 2.54 || null : Number(height.cm) || null;
  const weightKg = Number(weight) > 0 ? toKg(Number(weight), unit) : null;
  const b = bmi(heightCm, weightKg);
  const template = useMemo(() => starterTemplate(style, frequency), [style, frequency]);
  const who = name.trim() || "friend";

  const order: Step[] = ["name", "style", "frequency", "experience", "body", "plan", ...(sb && !hasDiscord ? (["discord"] as Step[]) : []), "done"];
  const next = () => setStep(order[Math.min(order.length - 1, order.indexOf(step) + 1)]);
  const back = () => setStep(order[Math.max(0, order.indexOf(step) - 1)]);

  /** Save everything. Called before leaving for Discord linking, and at the end. */
  const save = async () => {
    const about: About = { style, frequency, experience, heightCm: heightCm && heightCm >= 90 && heightCm <= 250 ? Math.round(heightCm) : null };
    const p = await store.updateProfile({ displayName: name.trim() || profile.displayName, unit, about, onboardedAt: new Date().toISOString() });
    setProfile(p);
    if (weightKg && weightKg >= 25 && weightKg <= 300) await store.logBodyweight({ date: localDate(now(), profile.timezone), weightKg }).catch(() => {});
    const perWeek = FREQUENCIES.find((f) => f.id === frequency)?.perWeek;
    // New lifters get guided sets (suggested weights) by default; everyone can change it in Settings.
    setOverrides(deepMerge((overrides ?? {}) as Record<string, unknown>, { ...(perWeek ? { dashboard: { weeklyTarget: perWeek } } : {}), ...(experience === "new" ? { logging: { guided: true } } : {}) }));
    if (plan === "starter") {
      const split = templateToSplit(template, await store.listExercises(), uid);
      await store.saveSplit(split);
      await store.setActiveSplit(split.id);
    }
  };

  const finish = async () => {
    setBusy(true);
    try {
      await save();
      mascot.say("welcome", { name: who, day: plan === "starter" ? template.days[0].name : todayName });
      refresh();
      onDone();
      if (plan === "import") router.push("/import");
      if (plan === "build") router.push("/split");
    } finally {
      setBusy(false);
    }
  };

  const skip = async () => {
    const p = await store.updateProfile({ onboardedAt: new Date().toISOString() }).catch(() => null);
    if (p) setProfile(p);
    onDone();
  };

  const linkDiscord = async () => {
    if (!sb) return;
    setBusy(true);
    await save().catch(() => {}); // the link leaves the page; keep the answers
    await sb.sb.auth.linkIdentity({ provider: "discord", options: { redirectTo: `${location.origin}/auth/callback` } });
  };

  const styleLabel = STYLES.find((s) => s.id === style)?.label;
  const freqLabel = FREQUENCIES.find((f) => f.id === frequency)?.label;

  return (
    <div className="onb" role="dialog" aria-label="Set up with James">
      <div className="spread">
        <div className="onb-dots" aria-hidden>{order.map((s) => <i key={s} className={s === step ? "on" : order.indexOf(s) < order.indexOf(step) ? "done" : ""} />)}</div>
        {step !== "done" && <button className="btn sm ghost" onClick={skip}>Skip setup</button>}
      </div>

      {step === "name" && (
        <>
          <Ask text={`Hey there! I'm ${bot}, your coach here at ${cfg.brand.appName}! What should I call you?`} />
          <input autoFocus className="onb-input" placeholder="Your name" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && name.trim() && next()} aria-label="Your name" />
          <button className="btn primary big" disabled={!name.trim()} onClick={next}>That&apos;s me!</button>
        </>
      )}

      {step === "style" && (
        <>
          <Ask text={`Great to meet you, ${who}! So what are you training for?`} />
          <Choice items={STYLES} value={style} onPick={(v) => { setStyle(v); next(); }} />
        </>
      )}

      {step === "frequency" && (
        <>
          <Ask text={`${styleLabel ?? "Love it"}! How often can you get a workout in?`} />
          <Choice items={FREQUENCIES} value={frequency} onPick={(v) => { setFrequency(v); next(); }} />
        </>
      )}

      {step === "experience" && (
        <>
          <Ask text={`${freqLabel === "Gym Rat" || freqLabel === "Every Day" ? "A dedicated one! " : ""}And how long have you been training?`} />
          <Choice items={EXPERIENCE} value={experience} onPick={(v) => { setExperience(v); next(); }} />
        </>
      )}

      {step === "body" && (
        <>
          <Ask text="Almost done! Pounds or kilos? Height and weight are optional, but they help me give you better advice." mood="neutral" />
          <div className="segmented" style={{ justifySelf: "start" }}>
            {(["lb", "kg"] as Unit[]).map((u) => <button key={u} className={unit === u ? "on" : ""} onClick={() => setUnit(u)}>{u === "lb" ? "Pounds (lb)" : "Kilos (kg)"}</button>)}
          </div>
          <div className="row" style={{ gap: 8 }}>
            {unit === "lb" ? (
              <>
                <input className="onb-small" inputMode="numeric" placeholder="ft" value={height.ft} onChange={(e) => setHeight({ ...height, ft: e.target.value.replace(/\D/g, "") })} aria-label="Height, feet" />
                <input className="onb-small" inputMode="numeric" placeholder="in" value={height.inch} onChange={(e) => setHeight({ ...height, inch: e.target.value.replace(/\D/g, "") })} aria-label="Height, inches" />
              </>
            ) : (
              <input className="onb-small" inputMode="numeric" placeholder="cm" value={height.cm} onChange={(e) => setHeight({ ...height, cm: e.target.value.replace(/\D/g, "") })} aria-label="Height in cm" />
            )}
            <input className="onb-small" inputMode="decimal" placeholder={`weight (${unit})`} value={weight} onChange={(e) => setWeight(e.target.value.replace(/[^\d.]/g, ""))} aria-label={`Weight in ${unit}`} />
          </div>
          {b && <p className="small" style={{ margin: 0 }}>BMI <strong>{b.value}</strong> ({b.band}). <span className="muted">{BMI_NOTE}</span></p>}
          <button className="btn primary big" onClick={next}>{heightCm || weightKg ? "Next" : "Skip this"}</button>
        </>
      )}

      {step === "plan" && (
        <>
          <Ask text={`Now let's get you a plan, ${who}!`} mood="proud" />
          <div className="onb-choices">
            {hasSplit && (
              <button className={`onb-choice ${plan === "keep" ? "on" : ""}`} onClick={() => setPlan("keep")}><strong>Keep my current split</strong><span className="muted small">You already have one set up</span></button>
            )}
            <button className={`onb-choice ${plan === "starter" ? "on" : ""}`} onClick={() => setPlan("starter")}>
              <strong>Use {bot}&apos;s pick: {template.name}</strong>
              <span className="muted small">{template.why} {template.days.map((d) => d.name).join(" · ")}</span>
            </button>
            <button className={`onb-choice ${plan === "import" ? "on" : ""}`} onClick={() => setPlan("import")}><strong>Bring my own</strong><span className="muted small">A photo, notes, or a spreadsheet; I&apos;ll read it</span></button>
            <button className={`onb-choice ${plan === "build" ? "on" : ""}`} onClick={() => setPlan("build")}><strong>I&apos;ll build it myself</strong><span className="muted small">Opens the Split editor</span></button>
          </div>
          <button className="btn primary big" disabled={!plan} onClick={next}>Next</button>
        </>
      )}

      {step === "discord" && (
        <>
          <Ask text={`Want me in Discord too? Link it and you can log sets with /log and ask me things with /ask!`} />
          <button className="btn primary big" disabled={busy} onClick={linkDiscord}>Link Discord</button>
          <button className="btn" onClick={next}>Not now</button>
        </>
      )}

      {step === "done" && (
        <>
          <Ask text={`All set, ${who}! ${plan === "starter" ? `${template.days[0].name} is up first.` : plan === "import" ? "Let's bring your plan in." : plan === "build" ? "Let's build your split." : "Your split's ready."} Let's get to work!`} mood="proud" />
          <button className="btn primary big" disabled={busy} onClick={finish}>{busy ? "Setting up…" : "Let's go!"}</button>
          <p className="muted small" style={{ margin: 0 }}>Change any of this later in Settings.</p>
        </>
      )}

      {step !== "name" && step !== "done" && <button className="btn sm ghost" style={{ justifySelf: "start" }} onClick={back}>‹ Back</button>}
    </div>
  );
}
