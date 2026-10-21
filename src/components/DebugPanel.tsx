"use client";

import { useEffect, useState } from "react";
import { useApp } from "./AppProvider";

/** Floating panel: effective config, store state and a time-travel control. Enable with ?debug=1 or config.debug.panel. */
export function DebugPanel() {
  const { cfg, store, profile, now, overrides, setOverrides, version, refresh } = useApp();
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<unknown>(null);

  useEffect(() => {
    if (!open) return;
    (async () => {
      const [today, splitState, openSession] = await Promise.all([store.getToday(now()), store.getSplitState(), store.getOpenSession()]);
      setState({ backend: store.kind, now: now().toISOString(), profile, today, splitState, openSession });
    })();
  }, [open, store, version, profile, now]);

  if (!cfg.debug.panel) return null;

  const shiftDays = (d: number) => {
    const base = cfg.debug.fakeNow ? new Date(cfg.debug.fakeNow) : new Date();
    const next = new Date(base.getTime() + d * 86_400_000).toISOString();
    setOverrides({ ...(overrides as object), debug: { ...((overrides as { debug?: object })?.debug ?? {}), fakeNow: next } });
  };

  return (
    <>
      <button className="btn sm debug-fab" onClick={() => setOpen(!open)}>🐞</button>
      {open && (
        <div className="debug-panel">
          <div className="spread"><h2>Debug</h2><button className="btn sm" onClick={() => setOpen(false)}>Close</button></div>
          <div className="row">
            <span>Time travel:</span>
            <button className="btn sm" onClick={() => shiftDays(-1)}>−1 day</button>
            <button className="btn sm" onClick={() => shiftDays(1)}>+1 day</button>
            <button className="btn sm" onClick={() => setOverrides({ ...(overrides as object), debug: { ...((overrides as { debug?: object })?.debug ?? {}), fakeNow: null } })}>Real clock</button>
            <button className="btn sm" onClick={refresh}>Reload data</button>
          </div>
          <h2 style={{ marginTop: 12 }}>State</h2>
          <pre className="code">{JSON.stringify(state, null, 2)}</pre>
          <h2>Local overrides</h2>
          <pre className="code">{JSON.stringify(overrides ?? {}, null, 2)}</pre>
          <h2>Effective config</h2>
          <pre className="code">{JSON.stringify(cfg, null, 2)}</pre>
        </div>
      )}
    </>
  );
}
