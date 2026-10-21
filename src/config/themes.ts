/** Theme presets. Every key in `vars` becomes a CSS variable (--key). Add presets freely. */
export type ThemeVars = Record<string, string>;

/**
 * "playful": floating capsule nav with round icons, pill buttons, big rounded cards.
 * "pro": iOS-style labelled tab bar, quieter cards, tighter radius.
 */
export type UiStyle = "playful" | "pro";

export interface ThemePreset {
  label: string;
  style: UiStyle;
  /** Frosted-glass surfaces over a vivid background (Settings → Glass can force it on or off). */
  glass?: boolean;
  vars: ThemeVars;
}

const APPLE = '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Inter", "Segoe UI", Roboto, system-ui, sans-serif';
const ROUNDED = '"Outfit", -apple-system, BlinkMacSystemFont, "SF Pro Rounded", system-ui, sans-serif';

export const THEME_PRESETS: Record<string, ThemePreset> = {
  midnight: {
    label: "Midnight Lime",
    style: "playful",
    vars: {
      bg: "#111214", surface: "#1c1d21", "surface-2": "#26282d", text: "#f5f6f7", muted: "#9a9ea8", border: "#2a2c31",
      accent: "#d7f75b", "accent-text": "#14160c", highlight: "#4c62e8", "highlight-text": "#ffffff",
      "ring-a": "#d7f75b", "ring-b": "#4c62e8", pr: "#ffb84d", good: "#7ee08a", bad: "#ff6b6b",
      "seg-thumb": "#d7f75b", "seg-thumb-text": "#14160c", font: ROUNDED, radius: "22px",
      "bg-glow": "radial-gradient(1200px 600px at 10% -10%, #2a3b1d55, transparent 60%), radial-gradient(900px 500px at 110% 10%, #1d2a5a55, transparent 60%)",
    },
  },
  neon: {
    label: "Neon (black + yellow)",
    style: "playful",
    vars: {
      bg: "#050505", surface: "#141414", "surface-2": "#202020", text: "#ffffff", muted: "#8e8e93", border: "#242424",
      accent: "#e4ff3a", "accent-text": "#0a0a0a", highlight: "#1c1c1e", "highlight-text": "#ffffff",
      "ring-a": "#e4ff3a", "ring-b": "#b6ff3a", pr: "#ffb020", good: "#b6ff3a", bad: "#ff5a52",
      "seg-thumb": "#ffffff", "seg-thumb-text": "#000000", font: ROUNDED, radius: "22px", "bg-glow": "none",
    },
  },
  tactical: {
    label: "Tactical (navy HUD)",
    style: "playful",
    vars: {
      bg: "#060c17", surface: "#0c1525", "surface-2": "#132036", text: "#e3ecf7", muted: "#7f93ad", border: "#1b2a43",
      accent: "#2f9bff", "accent-text": "#ffffff", highlight: "#0f2442", "highlight-text": "#e3ecf7",
      "ring-a": "#2f9bff", "ring-b": "#ff7a3d", pr: "#ff7a3d", good: "#34d399", bad: "#f87171",
      "seg-thumb": "#2f9bff", "seg-thumb-text": "#ffffff", font: APPLE, radius: "18px",
      "bg-glow": "radial-gradient(900px 500px at 50% -10%, #1b4d8a55, transparent 65%), radial-gradient(600px 400px at 100% 100%, #ff7a3d14, transparent 60%)",
    },
  },
  aurora: {
    label: "Aurora Glass",
    style: "playful",
    glass: true,
    vars: {
      bg: "#0a0a14", surface: "#1d1d2e", "surface-2": "#2a2a40", text: "#ffffff", muted: "#c7c7dc", border: "#ffffff26",
      accent: "#ffffff", "accent-text": "#111118", highlight: "#7c5cff", "highlight-text": "#ffffff",
      "ring-a": "#7cf2ff", "ring-b": "#ff7ad9", pr: "#ffd166", good: "#7cf2c0", bad: "#ff8a8a",
      "seg-thumb": "#ffffff", "seg-thumb-text": "#111118", font: APPLE, radius: "24px",
      "bg-glow":
        "radial-gradient(700px 520px at 0% 0%, #7c5cffcc, transparent 60%), radial-gradient(600px 520px at 100% 20%, #ff5fb8aa, transparent 60%), radial-gradient(700px 600px at 30% 100%, #22d3ee99, transparent 60%), linear-gradient(160deg, #1a1036, #0b1630)",
    },
  },
  fresh: {
    label: "Fresh (light, teal → violet)",
    style: "playful",
    vars: {
      bg: "#f4f6f8", surface: "#ffffff", "surface-2": "#eef1f5", text: "#14171f", muted: "#6b7280", border: "#e6e9ef",
      accent: "#14c8b8", "accent-text": "#ffffff", highlight: "#7b5cf0", "highlight-text": "#ffffff",
      "ring-a": "#14c8b8", "ring-b": "#c457f0", pr: "#f59e0b", good: "#10b981", bad: "#ef4444",
      "seg-thumb": "#ffffff", "seg-thumb-text": "#14171f", font: ROUNDED, radius: "22px",
      "bg-glow": "radial-gradient(800px 400px at 110% -10%, #14c8b833, transparent 60%)",
    },
  },
  ice: {
    label: "Ice (iOS light)",
    style: "pro",
    vars: {
      bg: "#f2f2f7", surface: "#ffffff", "surface-2": "#e9e9ef", text: "#000000", muted: "#8a8a8e", border: "#e2e2e7",
      accent: "#000000", "accent-text": "#ffffff", highlight: "#000000", "highlight-text": "#ffffff",
      "ring-a": "#34c759", "ring-b": "#5856d6", pr: "#ff9f0a", good: "#34c759", bad: "#ff3b30",
      "seg-thumb": "#ffffff", "seg-thumb-text": "#000000", font: APPLE, radius: "18px", "bg-glow": "none",
    },
  },
  graphite: {
    label: "Graphite (gradient rings)",
    style: "playful",
    vars: {
      bg: "#1b1f27", surface: "#252a35", "surface-2": "#303643", text: "#e8ecf3", muted: "#8f98a8", border: "#363d4b",
      accent: "#38b6ff", "accent-text": "#0b1220", highlight: "#e0568f", "highlight-text": "#ffffff",
      "ring-a": "#e0568f", "ring-b": "#38b6ff", pr: "#f7c948", good: "#4ade80", bad: "#f87171",
      "seg-thumb": "#38b6ff", "seg-thumb-text": "#0b1220", font: ROUNDED, radius: "22px",
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
      "seg-thumb": "#2f3846", "seg-thumb-text": "#ffffff", font: APPLE, radius: "14px", "bg-glow": "none",
    },
  },
  professional: {
    label: "Pro Light",
    style: "pro",
    vars: {
      bg: "#f6f7f9", surface: "#ffffff", "surface-2": "#eef0f4", text: "#111827", muted: "#6b7280", border: "#e3e6eb",
      accent: "#2563eb", "accent-text": "#ffffff", highlight: "#eef3ff", "highlight-text": "#1e3a8a",
      "ring-a": "#2563eb", "ring-b": "#2563eb", pr: "#f59e0b", good: "#047857", bad: "#dc2626",
      "seg-thumb": "#ffffff", "seg-thumb-text": "#111827", font: APPLE, radius: "14px", "bg-glow": "none",
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
