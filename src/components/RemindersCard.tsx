"use client";

import { useCallback, useEffect, useState } from "react";
import type { AnnounceSettings, Reminder } from "@/lib/domain/types";
import { localDate } from "@/lib/domain/split";
import { uid } from "@/lib/store/local";
import { useApp } from "./AppProvider";

const DAYS = ["S", "M", "T", "W", "T", "F", "S"];
const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** Settings → Reminders & announcements. Sending needs the Supabase backend + Discord bot. */
export function RemindersCard() {
  const { cfg, store, profile, version, now } = useApp();
  const [test, setTest] = useState<{ ok: boolean; message: string } | null>(null);
  const [testing, setTesting] = useState(false);
  const today = localDate(now(), profile.timezone);
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [announce, setAnnounce] = useState<AnnounceSettings>({ enabled: false, channelSet: false });
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [r, a] = await Promise.all([store.listReminders(), store.getAnnounceSettings()]);
      setReminders(r);
      setAnnounce(a);
      setError(null);
    } catch (e) {
      setError(String(e));
    }
  }, [store]);

  useEffect(() => {
    void load();
  }, [load, version]);

  const save = async (r: Reminder) => {
    setReminders((list) => list.map((x) => (x.id === r.id ? r : x)));
    try {
      await store.saveReminder(r);
      await load();
    } catch (e) {
      setError(String(e));
    }
  };

  const add = async () => {
    await save({ id: uid(), channel: "discord", localTime: "18:00", days: [1, 2, 3, 4, 5], enabled: true, lastSentOn: null, lastError: null });
    await load();
  };

  return (
    <div className="card stack">
      <h2>Reminders</h2>
      <p className="muted small">
        {cfg.brand.botName} sends a Discord DM at your chosen time with today&apos;s split day and <b>Start / Rest day / Skip / Snooze</b> buttons. It isn&apos;t sent if you&apos;ve
        already trained that day. Times are in your timezone ({profile.timezone}).
        {store.kind === "local" && " Local mode only stores these; sending needs the Supabase backend."}
      </p>
      {error && <pre className="code">{error}</pre>}

      {reminders.map((r) => (
        <div key={r.id} className="stack" style={{ background: "var(--surface-2)", borderRadius: 14, padding: 12, gap: 8 }}>
          {r.lastError && <div className="small" style={{ color: "var(--bad)" }}>⚠️ {r.lastError}</div>}
          {!r.lastError && r.lastSentOn === today && (
            <div className="muted small">✓ Already handled today (sent, or skipped because you trained or it&apos;s a rest day). Next one tomorrow.</div>
          )}
          <div className="row">
            <input type="time" value={r.localTime} onChange={(e) => save({ ...r, localTime: e.target.value })} aria-label="Reminder time" />
            <label className="row small">
              <input type="checkbox" checked={r.enabled} onChange={(e) => save({ ...r, enabled: e.target.checked, lastError: e.target.checked ? null : r.lastError })} /> On
            </label>
            <button className="btn sm ghost" style={{ marginLeft: "auto" }} onClick={async () => { await store.deleteReminder(r.id); await load(); }} aria-label="Delete reminder">✕</button>
          </div>
          <div className="row" style={{ gap: 4 }}>
            {DAYS.map((d, i) => {
              const on = r.days.includes(i);
              return (
                <button
                  key={i}
                  className={`btn sm ${on ? "primary" : ""}`}
                  style={{ width: 36, padding: 0 }}
                  aria-pressed={on}
                  aria-label={DAY_NAMES[i]}
                  onClick={() => save({ ...r, days: on ? r.days.filter((x) => x !== i) : [...r.days, i].sort() })}
                >
                  {d}
                </button>
              );
            })}
          </div>
        </div>
      ))}
      <div className="row">
        <button className="btn" onClick={add}>+ Add reminder</button>
        <button
          className="btn"
          disabled={testing}
          onClick={async () => {
            setTesting(true);
            setTest(null);
            try {
              setTest(await store.sendTestReminder(reminders[0]?.id));
            } catch (e) {
              setTest({ ok: false, message: e instanceof Error ? e.message : String(e) });
            } finally {
              setTesting(false);
            }
          }}
        >
          {testing ? "Sending…" : "Send test reminder"}
        </button>
      </div>
      {test && <div className="small" style={{ color: test.ok ? "var(--good)" : "var(--bad)" }}>{test.ok ? "✓ " : "⚠️ "}{test.message}</div>}
      <p className="muted small" style={{ margin: 0 }}>The test DMs you right now and ignores the &quot;already trained&quot; and rest-day rules. Your real reminders aren&apos;t affected.</p>

      <h2 style={{ marginTop: 8 }}>PR announcements</h2>
      <label className="row small">
        <input type="checkbox" checked={announce.enabled} onChange={async (e) => { await store.setAnnouncePRs(e.target.checked); await load(); }} />
        Post my PRs in a Discord channel
      </label>
      <p className="muted small">
        {announce.channelSet
          ? "Posting to the channel where you ran /announce on. Run it in another channel to move it."
          : "Pick the channel by running /announce on inside it (the bot must be added to that server)."}
      </p>
    </div>
  );
}
