/** Theme presets. Every key becomes a CSS variable (--key). Add presets freely. */
export type ThemeVars = Record<string, string>;

/**
 * "playful": floating round nav, pill buttons, big rounded cards.
 * "pro": labelled tab bar, rectangular controls, tighter radius, quieter cards.
 */
export type UiStyle = "playful" | "pro";

export const THEME_PRESETS: Record<string, { label: string; style: UiStyle; vars: ThemeVars }> = {
  midnight: {
    label: "Midnight Lime",
    style: "playful",
    vars: {
      bg: "#131417", surface: "#1e2024", "surface-2": "#2a2d33", text: "#f3f4f6", muted: "#9a9fa9", border: "#2f3238",
      accent: "#d7f75b", "accent-text": "#15170f", highlight: "#4c62e8", "highlight-text": "#ffffff",
      "ring-a": "#d7f75b", "ring-b": "#4c62e8", pr: "#ffb84d", good: "#7ee08a", bad: "#ff6b6b",
      "bg-glow": "radial-gradient(1200px 600px at 10% -10%, #2a3b1d55, transparent 60%), radial-gradient(900px 500px at 110% 10%, #1d2a5a55, transparent 60%)",
    },
  },
  fresh: {
    label: "Fresh (light, teal → violet)",
    style: "playful",
    vars: {
      bg: "#f4f6f8", surface: "#ffffff", "surface-2": "#eef1f5", text: "#1b1f2a", muted: "#6b7280", border: "#e3e7ee",
      accent: "#14c8b8", "accent-text": "#ffffff", highlight: "#7b5cf0", "highlight-text": "#ffffff",
      "ring-a": "#14c8b8", "ring-b": "#c457f0", pr: "#f59e0b", good: "#10b981", bad: "#ef4444",
      "bg-glow": "radial-gradient(800px 400px at 110% -10%, #14c8b833, transparent 60%)",
    },
  },
  graphite: {
    label: "Graphite (gradient rings)",
    style: "playful",
    vars: {
      bg: "#1b1f27", surface: "#252a35", "surface-2": "#303643", text: "#e8ecf3", muted: "#8f98a8", border: "#363d4b",
      accent: "#38b6ff", "accent-text": "#0b1220", highlight: "#e0568f", "highlight-text": "#ffffff",
      "ring-a": "#e0568f", "ring-b": "#38b6ff", pr: "#f7c948", good: "#4ade80", bad: "#f87171",
      "bg-glow": "linear-gradient(180deg, #1b1f27, #141820)",
    },
  },
  "pro-dark": {
    label: "Pro Dark",
    style: "pro",
    vars: {
      bg: "#0e1116", surface: "#151a21", "surface-2": "#1c222b", text: "#e6e9ef", muted: "#8b95a5", border: "#262d38",
      accent: "#4f8cff", "accent-text": "#ffffff", highlight: "#1a2433", "highlight-text": "#e6e9ef",
      "ring-a": "#4f8cff", "ring-b": "#4f8cff", pr: "#f0b429", good: "#3ecf8e", bad: "#f87171",
      "bg-glow": "none", radius: "10px", font: '"Inter", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
    },
  },
  professional: {
    label: "Pro Light",
    style: "pro",
    vars: {
      bg: "#f6f7f9", surface: "#ffffff", "surface-2": "#f1f3f6", text: "#111827", muted: "#6b7280", border: "#e3e6eb",
      accent: "#2563eb", "accent-text": "#ffffff", highlight: "#eef3ff", "highlight-text": "#1e3a8a",
      "ring-a": "#2563eb", "ring-b": "#2563eb", pr: "#f59e0b", good: "#047857", bad: "#dc2626",
      "bg-glow": "none", radius: "10px", font: '"Inter", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
    },
  },
};

/** WCAG relative-luminance contrast ratio for two #rrggbb colors (null if unparseable). */
export function contrastRatio(a: string, b: string): number | null {
  const lum = (hex: string) => {
    const m = hex.trim().match(/^#([0-9a-f]{6})/i);
    if (!m) return null;
    const [r, g, bl] = [0, 2, 4].map((i) => {
      const c = parseInt(m[1].slice(i, i + 2), 16) / 255;
      return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const la = lum(a);
  const lb = lum(b);
  if (la == null || lb == null) return null;
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}
