"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export interface ToastMsg {
  text: string;
  undo?: () => void | Promise<void>;
}

/** Undo, never confirm: every save/delete shows a short-lived toast with Undo. */
export function useToast(ms: number) {
  const [msg, setMsg] = useState<ToastMsg | null>(null);
  const t = useRef<ReturnType<typeof setTimeout> | null>(null);
  const show = useCallback(
    (m: ToastMsg) => {
      if (t.current) clearTimeout(t.current);
      setMsg(m);
      t.current = setTimeout(() => setMsg(null), ms);
    },
    [ms],
  );
  useEffect(() => () => { if (t.current) clearTimeout(t.current); }, []);
  const node = msg ? (
    <div className="toast" role="status">
      <span>{msg.text}</span>
      {msg.undo && (
        <button onClick={async () => { const u = msg.undo; setMsg(null); await u?.(); }}>Undo</button>
      )}
    </div>
  ) : null;
  return { show, node };
}
