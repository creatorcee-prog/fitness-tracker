"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { THEME_PRESETS, themeVars } from "@/config/themes";
import { buildSrcDoc, readWidgetMessage, type WidgetData } from "@/lib/widgets/sandbox";
import { useApp } from "./AppProvider";

/** Your own widget, run in a locked-down frame (see lib/widgets/sandbox.ts for what it can and can't do). */
export function CustomWidget({ code, title, data, inert = false }: { code: string; title: string; data: WidgetData | null; inert?: boolean }) {
  const { cfg, mode } = useApp();
  const router = useRouter();
  const frame = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(120);
  const vars = useMemo(() => ({ ...themeVars(THEME_PRESETS[cfg.theme.preset] ?? THEME_PRESETS.ember, mode), ...cfg.theme.vars }), [cfg.theme.preset, cfg.theme.vars, mode]);
  const srcDoc = useMemo(() => buildSrcDoc(code, vars, mode), [code, vars, mode]);

  // Only messages from this widget's own frame count, and only resize / open-a-page.
  useEffect(() => {
    const on = (e: MessageEvent) => {
      if (e.source !== frame.current?.contentWindow) return;
      const m = readWidgetMessage(e.data);
      if (m?.type === "resize") setHeight(m.height);
      if (m?.type === "open" && !inert) router.push(m.path);
    };
    window.addEventListener("message", on);
    return () => window.removeEventListener("message", on);
  }, [router, inert]);

  const send = () => frame.current?.contentWindow?.postMessage({ type: "gg:data", data }, "*");
  useEffect(send, [data, srcDoc]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <iframe
      ref={frame}
      title={title}
      // allow-scripts only: no same-origin (so no access to the app or your login), no forms, popups or navigation.
      sandbox="allow-scripts"
      srcDoc={srcDoc}
      onLoad={send}
      referrerPolicy="no-referrer"
      // Same color scheme inside and out, or the browser paints the frame white.
      style={{ width: "100%", height, border: 0, display: "block", background: "transparent", colorScheme: mode, pointerEvents: inert ? "none" : "auto" }}
    />
  );
}
