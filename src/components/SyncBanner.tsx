"use client";

import { useState } from "react";
import { SyncStore } from "@/lib/store/sync";
import { useApp } from "./AppProvider";

/** Shows offline state and changes waiting to sync (offline logging, Supabase backend). */
export function SyncBanner() {
  const { store } = useApp(); // re-renders on every store notification via `version`
  const [open, setOpen] = useState(false);
  if (!(store instanceof SyncStore)) return null;
  const s = store.status();
  if (s.online && !s.pending && !s.errors.length) return null;

  let text: string;
  if (!s.online) text = s.pending ? `Offline · ${s.pendingSets || s.pending} ${s.pendingSets ? "set" : "change"}${(s.pendingSets || s.pending) === 1 ? "" : "s"} saved on this phone, will sync when you're back online` : "Offline · logging still works and will sync later";
  else if (s.pending) text = `Syncing ${s.pending} change${s.pending === 1 ? "" : "s"}…`;
  else text = `${s.errors.length} change${s.errors.length === 1 ? "" : "s"} couldn't sync`;

  return (
    <div className={`sync-banner ${s.online ? "" : "off"}`} role="status">
      <span className="dot" />
      <span style={{ flex: 1 }}>{text}</span>
      {s.errors.length > 0 && <button className="btn sm ghost" onClick={() => setOpen(!open)}>{open ? "Hide" : "Details"}</button>}
      {!s.online && <button className="btn sm ghost" onClick={() => void store.sync().catch(() => {})}>Retry</button>}
      {open && <pre className="code" style={{ width: "100%" }}>{s.errors.join("\n")}</pre>}
    </div>
  );
}
