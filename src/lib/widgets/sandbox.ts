/**
 * Custom widgets: your own HTML/CSS/JS on Today, for tech-savvy users (like
 * personal scripts on a wiki, but safe to paste from someone else).
 *
 * The code runs in an <iframe sandbox="allow-scripts"> with no
 * allow-same-origin, so it gets a blank "null" origin: it can't see the
 * app's page, cookies, storage or your login. A Content-Security-Policy
 * inside the frame blocks every network request (fetch, images, fonts,
 * forms), and the app's own CSP (next.config) blocks the frame from
 * navigating away, so a widget can't send your data anywhere.
 *
 * What a widget gets: a read-only copy of your training data (`gg.data`,
 * updated via `gg.onData`), the theme colors as CSS variables, and two
 * requests it can make: resize itself, and open one of the app's pages.
 */
export const WIDGET_CSP = "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; font-src data:; form-action 'none'; base-uri 'none'";
export const MAX_CODE_CHARS = 20_000;
export const OPENABLE_PATHS = ["/", "/progress", "/split", "/friends", "/settings", "/import"] as const;

/** Read-only data a widget receives. No ids, names of other people, or account details. */
export interface WidgetData {
  unit: "lb" | "kg";
  today: { kind: "day" | "rest" | "no-split"; dayName: string | null; exercises: { name: string; sets: number; reps: string }[] };
  week: { done: number; target: number };
  streak: { weeks: number; freezes: number };
  /** Newest first, up to 10. Weights in `unit`. */
  recent: { date: string; dayName: string | null; lifts: { name: string; sets: { weight: number; reps: number }[] }[] }[];
  /** Best estimated 1RM per lift, in `unit`, strongest first. */
  lifts: { name: string; e1rm: number }[];
  /** Newest first, up to 10. */
  prs: { date: string; lift: string; type: string; weight: number; reps: number }[];
  bodyweight: { date: string; weight: number }[];
}

const esc = (s: string) => s.replace(/</g, "\\u003c");

/** The frame's whole document: CSP first (later policies can only tighten it), theme, the bridge, then your code. */
export function buildSrcDoc(code: string, themeVars: Record<string, string>, mode: "dark" | "light" = "dark"): string {
  const vars = Object.entries(themeVars)
    .filter(([k, v]) => /^[a-z0-9-]+$/i.test(k) && !/[<>{};]/.test(v))
    .map(([k, v]) => `--${k}:${v};`)
    .join("");
  return `<!doctype html><html><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${WIDGET_CSP}">
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>:root{${vars}color-scheme:${mode === "light" ? "light" : "dark"}}html,body{margin:0;padding:0;background:transparent;}body{display:flow-root;color:var(--text);font:15px/1.35 -apple-system,BlinkMacSystemFont,"Inter",system-ui,sans-serif}</style>
<script>
(function(){
  var listeners=[];
  var gg={data:null,onData:function(cb){listeners.push(cb);if(gg.data)cb(gg.data);},
    resize:function(h){parent.postMessage({type:"gg:resize",height:Math.ceil(h||document.body.getBoundingClientRect().height)},"*");},
    open:function(path){parent.postMessage({type:"gg:open",path:String(path)},"*");}};
  window.gg=gg;
  addEventListener("message",function(e){
    if(e.source!==parent||!e.data||e.data.type!=="gg:data")return;
    gg.data=e.data.data;listeners.forEach(function(cb){try{cb(gg.data)}catch(err){console.error(err)}});
    setTimeout(gg.resize,0);
  });
  addEventListener("load",function(){gg.resize();});
  addEventListener("DOMContentLoaded",function(){if(window.ResizeObserver)new ResizeObserver(function(){gg.resize();}).observe(document.body);});
})();
</script></head><body>
${code.slice(0, MAX_CODE_CHARS)}
</body></html>`;
}

/** Validates a message from a widget frame. Anything unexpected is ignored. */
export function readWidgetMessage(raw: unknown): { type: "resize"; height: number } | { type: "open"; path: (typeof OPENABLE_PATHS)[number] } | null {
  if (!raw || typeof raw !== "object") return null;
  const m = raw as Record<string, unknown>;
  if (m.type === "gg:resize" && typeof m.height === "number" && Number.isFinite(m.height)) return { type: "resize", height: Math.max(40, Math.min(600, Math.round(m.height))) };
  if (m.type === "gg:open" && typeof m.path === "string" && (OPENABLE_PATHS as readonly string[]).includes(m.path)) return { type: "open", path: m.path as (typeof OPENABLE_PATHS)[number] };
  return null;
}

/** Starter code shown in the editor: documents the API by example. */
export const WIDGET_TEMPLATE = `<!-- Your widget: HTML, CSS and JavaScript. It runs in a sandbox:
     no internet, no access to your account; it can only read gg.data.
     gg.data: unit, today, week, streak, recent, lifts, prs, bodyweight.
     gg.open("/progress") opens a page. Theme colors: var(--accent), var(--text), var(--muted)… -->
<style>
  .big { font-size: 28px; font-weight: 750; }
  .muted { color: var(--muted); font-size: 13px; }
</style>
<div class="muted">Best lift</div>
<div class="big" id="best">…</div>
<div class="muted" id="sub"></div>
<script>
  gg.onData(function (d) {
    var top = d.lifts[0];
    document.getElementById("best").textContent = top ? top.name + " " + Math.round(top.e1rm) + " " + d.unit : "Log a set first";
    document.getElementById("sub").textContent = d.week.done + "/" + d.week.target + " sessions this week";
  });
</script>`;
