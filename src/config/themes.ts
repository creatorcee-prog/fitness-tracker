/** Theme presets. Every key in `vars` becomes a CSS variable (--key). Add presets freely. */
export type ThemeVars = Record<string, string>;

/**
 * "playful": floating capsule nav with round icons, pill buttons, big rounded cards.
 * "pro": iOS-style labelled tab bar, quieter cards, tighter radius.
 */
export type UiStyle = "playful" | "pro";

export type ColorMode = "dark" | "light";

export interface ThemePreset {
  label: string;
  style: UiStyle;
  /** Frosted-glass surfaces over a vivid background (Settings → Glass can force it on or off). */
  glass?: boolean;
  /** Which mode `vars` is designed for. */
  mode: ColorMode;
  vars: ThemeVars;
  /** The same theme in the other mode (colors only; font and radius come from `vars`). */
  alt: ThemeVars;
}

/**
 * The variables for a preset in a mode. `link` (accent used as text) falls
 * back to the accent, which only works on dark backgrounds, so light
 * versions set their own.
 */
export function themeVars(p: ThemePreset, mode: ColorMode): ThemeVars {
  const v = p.mode === mode ? p.vars : { ...p.vars, ...p.alt };
  return { link: v.accent, ...v };
}

const APPLE = '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Inter", "Segoe UI", Roboto, system-ui, sans-serif';
const ROUNDED = '"Outfit", -apple-system, BlinkMacSystemFont, "SF Pro Rounded", system-ui, sans-serif';

export const THEME_PRESETS: Record<string, ThemePreset> = {
  ember: {
    label: "Ember (warm coral)",
    style: "playful",
    mode: "dark",
    vars: {
      bg: "#0e0c0d", surface: "#1a1718", "surface-2": "#252022", text: "#f6f1ef", muted: "#a89f9b", border: "#2e2729",
      accent: "#ff7a45", "accent-text": "#1c0b03", highlight: "#b8325a", "highlight-text": "#ffffff",
      "ring-a": "#ffb347", "ring-b": "#ff4f8b", pr: "#ffd166", good: "#6ee7a8", bad: "#ff6b6b",
      "seg-thumb": "#ff7a45", "seg-thumb-text": "#1c0b03", font: ROUNDED, radius: "22px",
      "bg-glow": "radial-gradient(900px 520px at 0% -10%, #ff7a4526, transparent 60%), radial-gradient(800px 520px at 110% 0%, #b8325a2e, transparent 60%)",
    },
    alt: {
      bg: "#fbf7f5", surface: "#ffffff", "surface-2": "#f4ece8", text: "#1f1512", muted: "#6e5f59", border: "#ece1dc", accent: "#ff7a45", "accent-text": "#1c0b03", link: "#a63a10", highlight: "#b8325a", "highlight-text": "#ffffff", "ring-a": "#ff9f1c", "ring-b": "#e8457f", pr: "#b45309", good: "#15803d", bad: "#dc2626", "seg-thumb": "#1f1512", "seg-thumb-text": "#ffffff", "bg-glow": "radial-gradient(900px 520px at 0% -10%, #ff7a451f, transparent 60%), radial-gradient(800px 520px at 110% 0%, #e8457f14, transparent 60%)",
    }
  },
  nebula: {
    label: "Nebula (violet + cyan)",
    style: "playful",
    mode: "dark",
    vars: {
      bg: "#0b0a14", surface: "#16142a", "surface-2": "#201d3a", text: "#f2f0fb", muted: "#a7a3c4", border: "#2a2648",
      accent: "#a78bfa", "accent-text": "#140d2b", highlight: "#5b3fd6", "highlight-text": "#ffffff",
      "ring-a": "#22d3ee", "ring-b": "#c084fc", pr: "#fbbf24", good: "#34d399", bad: "#fb7185",
      "seg-thumb": "#a78bfa", "seg-thumb-text": "#140d2b", font: ROUNDED, radius: "22px",
      "bg-glow": "radial-gradient(900px 560px at 0% -10%, #5b3fd640, transparent 60%), radial-gradient(800px 520px at 110% 10%, #22d3ee22, transparent 60%)",
    },
    alt: {
      bg: "#f6f5fc", surface: "#ffffff", "surface-2": "#eeecf8", text: "#17142b", muted: "#5f5a7d", border: "#e4e1f2", accent: "#6d4fe0", "accent-text": "#ffffff", link: "#5b3fd6", highlight: "#5b3fd6", "highlight-text": "#ffffff", "ring-a": "#0891b2", "ring-b": "#a855f7", pr: "#b45309", good: "#047857", bad: "#e11d48", "seg-thumb": "#6d4fe0", "seg-thumb-text": "#ffffff", "bg-glow": "radial-gradient(900px 560px at 0% -10%, #6d4fe01f, transparent 60%), radial-gradient(800px 520px at 110% 10%, #0891b214, transparent 60%)",
    }
  },
  volt: {
    label: "Volt (lime + teal)",
    style: "playful",
    mode: "dark",
    vars: {
      bg: "#0c0e10", surface: "#16191c", "surface-2": "#1f2327", text: "#f2f4f5", muted: "#97a2aa", border: "#272b30",
      accent: "#c8f560", "accent-text": "#11160a", highlight: "#0e6f68", "highlight-text": "#ffffff",
      "ring-a": "#c8f560", "ring-b": "#2dd4bf", pr: "#ffb84d", good: "#4ade80", bad: "#f87171",
      "seg-thumb": "#c8f560", "seg-thumb-text": "#11160a", font: ROUNDED, radius: "22px",
      "bg-glow": "radial-gradient(900px 520px at 0% -10%, #c8f56018, transparent 60%), radial-gradient(800px 520px at 110% 0%, #2dd4bf1f, transparent 60%)",
    },
    alt: {
      bg: "#f5f7f4", surface: "#ffffff", "surface-2": "#ecf0ea", text: "#12160f", muted: "#5b6459", border: "#e1e6de", accent: "#c8f560", "accent-text": "#11160a", link: "#3f6212", highlight: "#0e6f68", "highlight-text": "#ffffff", "ring-a": "#84cc16", "ring-b": "#14b8a6", pr: "#b45309", good: "#15803d", bad: "#dc2626", "seg-thumb": "#12160f", "seg-thumb-text": "#ffffff", "bg-glow": "radial-gradient(900px 520px at 0% -10%, #c8f5602e, transparent 60%), radial-gradient(800px 520px at 110% 0%, #14b8a614, transparent 60%)",
    }
  },
  midnight: {
    label: "Midnight Lime",
    style: "playful",
    mode: "dark",
    vars: {
      bg: "#111214", surface: "#1c1d21", "surface-2": "#26282d", text: "#f5f6f7", muted: "#9a9ea8", border: "#2a2c31",
      accent: "#d7f75b", "accent-text": "#14160c", highlight: "#4c62e8", "highlight-text": "#ffffff",
      "ring-a": "#d7f75b", "ring-b": "#4c62e8", pr: "#ffb84d", good: "#7ee08a", bad: "#ff6b6b",
      "seg-thumb": "#d7f75b", "seg-thumb-text": "#14160c", font: ROUNDED, radius: "22px",
      "bg-glow": "radial-gradient(1200px 600px at 10% -10%, #2a3b1d55, transparent 60%), radial-gradient(900px 500px at 110% 10%, #1d2a5a55, transparent 60%)",
    },
    alt: {
      bg: "#f5f6f2", surface: "#ffffff", "surface-2": "#eef0ea", text: "#15170f", muted: "#5f6459", border: "#e3e6dd", accent: "#d7f75b", "accent-text": "#14160c", link: "#3d52cc", highlight: "#3f55d6", "highlight-text": "#ffffff", "ring-a": "#9cc21a", "ring-b": "#4c62e8", pr: "#b45309", good: "#15803d", bad: "#dc2626", "seg-thumb": "#15170f", "seg-thumb-text": "#ffffff", "bg-glow": "radial-gradient(1200px 600px at 10% -10%, #d7f75b33, transparent 60%), radial-gradient(900px 500px at 110% 10%, #4c62e814, transparent 60%)",
    }
  },
  neon: {
    label: "Neon (black + yellow)",
    style: "playful",
    mode: "dark",
    vars: {
      bg: "#050505", surface: "#141414", "surface-2": "#202020", text: "#ffffff", muted: "#8e8e93", border: "#242424",
      accent: "#e4ff3a", "accent-text": "#0a0a0a", highlight: "#1c1c1e", "highlight-text": "#ffffff",
      "ring-a": "#e4ff3a", "ring-b": "#b6ff3a", pr: "#ffb020", good: "#b6ff3a", bad: "#ff5a52",
      "seg-thumb": "#ffffff", "seg-thumb-text": "#000000", font: ROUNDED, radius: "22px", "bg-glow": "none",
    },
    alt: {
      bg: "#fafaf5", surface: "#ffffff", "surface-2": "#f0f0e8", text: "#0a0a0a", muted: "#5c5c58", border: "#e6e6dd", accent: "#e4ff3a", "accent-text": "#0a0a0a", link: "#4d5a00", highlight: "#1c1c1e", "highlight-text": "#ffffff", "ring-a": "#a3b800", "ring-b": "#65a30d", pr: "#b45309", good: "#4d7c0f", bad: "#dc2626", "seg-thumb": "#0a0a0a", "seg-thumb-text": "#ffffff", "bg-glow": "none",
    }
  },
  tactical: {
    label: "Tactical (navy HUD)",
    style: "playful",
    mode: "dark",
    vars: {
      bg: "#060c17", surface: "#0c1525", "surface-2": "#132036", text: "#e3ecf7", muted: "#7f93ad", border: "#1b2a43",
      accent: "#2f9bff", "accent-text": "#04121f", highlight: "#0f2442", "highlight-text": "#e3ecf7",
      "ring-a": "#2f9bff", "ring-b": "#ff7a3d", pr: "#ff7a3d", good: "#34d399", bad: "#f87171",
      "seg-thumb": "#2f9bff", "seg-thumb-text": "#04121f", font: APPLE, radius: "18px",
      "bg-glow": "radial-gradient(900px 500px at 50% -10%, #1b4d8a55, transparent 65%), radial-gradient(600px 400px at 100% 100%, #ff7a3d14, transparent 60%)",
    },
    alt: {
      bg: "#f2f5fa", surface: "#ffffff", "surface-2": "#e8eef7", text: "#0b1626", muted: "#4f6380", border: "#dbe3ef", accent: "#1a6fd1", "accent-text": "#ffffff", link: "#1a6fd1", highlight: "#0f2442", "highlight-text": "#e3ecf7", "ring-a": "#1a6fd1", "ring-b": "#ea580c", pr: "#c2410c", good: "#047857", bad: "#dc2626", "seg-thumb": "#1a6fd1", "seg-thumb-text": "#ffffff", "bg-glow": "radial-gradient(900px 500px at 50% -10%, #1a6fd11a, transparent 65%)",
    }
  },
  aurora: {
    label: "Aurora Glass",
    style: "playful",
    glass: true,
    mode: "dark",
    vars: {
      bg: "#0a0a14", surface: "#1d1d2e", "surface-2": "#2a2a40", text: "#ffffff", muted: "#c7c7dc", border: "#ffffff26",
      accent: "#ffffff", "accent-text": "#111118", highlight: "#6f4ff2", "highlight-text": "#ffffff",
      "ring-a": "#7cf2ff", "ring-b": "#ff7ad9", pr: "#ffd166", good: "#7cf2c0", bad: "#ff8a8a",
      "seg-thumb": "#ffffff", "seg-thumb-text": "#111118", font: APPLE, radius: "24px",
      "bg-glow":
        "radial-gradient(700px 520px at 0% 0%, #7c5cffcc, transparent 60%), radial-gradient(600px 520px at 100% 20%, #ff5fb8aa, transparent 60%), radial-gradient(700px 600px at 30% 100%, #22d3ee99, transparent 60%), linear-gradient(160deg, #1a1036, #0b1630)",
    },
    alt: {
      bg: "#f4f2fb", surface: "#ffffff", "surface-2": "#f0edf9", text: "#15131f", muted: "#5e5a72", border: "#15131f1f", accent: "#15131f", "accent-text": "#ffffff", link: "#6d4fe0", highlight: "#6d4fe0", "highlight-text": "#ffffff", "ring-a": "#06b6d4", "ring-b": "#ec4899", pr: "#b45309", good: "#047857", bad: "#e11d48", "seg-thumb": "#15131f", "seg-thumb-text": "#ffffff", "bg-glow": "radial-gradient(700px 520px at 0% 0%, #a78bfa66, transparent 60%), radial-gradient(600px 520px at 100% 20%, #f9a8d466, transparent 60%), radial-gradient(700px 600px at 30% 100%, #67e8f966, transparent 60%), linear-gradient(160deg, #f4f2fb, #eef4fb)",
    }
  },
  fresh: {
    label: "Fresh (teal → violet)",
    style: "playful",
    mode: "light",
    vars: {
      bg: "#f4f6f8", surface: "#ffffff", "surface-2": "#eef1f5", text: "#14171f", muted: "#5f6673", border: "#e6e9ef",
      accent: "#14c8b8", "accent-text": "#04201d", link: "#0f766e", highlight: "#6d4fe0", "highlight-text": "#ffffff",
      "ring-a": "#14c8b8", "ring-b": "#c457f0", pr: "#b45309", good: "#047857", bad: "#dc2626",
      "seg-thumb": "#ffffff", "seg-thumb-text": "#14171f", font: ROUNDED, radius: "22px",
      "bg-glow": "radial-gradient(800px 400px at 110% -10%, #14c8b833, transparent 60%)",
    },
    alt: {
      bg: "#0d1214", surface: "#151c1f", "surface-2": "#1d262a", text: "#eef4f5", muted: "#94a3a8", border: "#243035", accent: "#2dd4bf", "accent-text": "#04201d", link: "#5eead4", highlight: "#6d4fe0", "highlight-text": "#ffffff", "ring-a": "#14c8b8", "ring-b": "#c457f0", pr: "#fbbf24", good: "#34d399", bad: "#f87171", "seg-thumb": "#2dd4bf", "seg-thumb-text": "#04201d", "bg-glow": "radial-gradient(800px 400px at 110% -10%, #14c8b822, transparent 60%)",
    }
  },
  ice: {
    label: "Ice (iOS)",
    style: "pro",
    mode: "light",
    vars: {
      bg: "#f2f2f7", surface: "#ffffff", "surface-2": "#e9e9ef", text: "#000000", muted: "#636366", border: "#e2e2e7",
      accent: "#000000", "accent-text": "#ffffff", link: "#0062cc", highlight: "#000000", "highlight-text": "#ffffff",
      "ring-a": "#34c759", "ring-b": "#5856d6", pr: "#b45309", good: "#1f8a3b", bad: "#d70015",
      "seg-thumb": "#ffffff", "seg-thumb-text": "#000000", font: APPLE, radius: "18px", "bg-glow": "none",
    },
    alt: {
      bg: "#000000", surface: "#1c1c1e", "surface-2": "#2c2c2e", text: "#ffffff", muted: "#98989f", border: "#2c2c2e", accent: "#ffffff", "accent-text": "#000000", link: "#0a84ff", highlight: "#ffffff", "highlight-text": "#000000", "ring-a": "#30d158", "ring-b": "#5e5ce6", pr: "#ff9f0a", good: "#30d158", bad: "#ff453a", "seg-thumb": "#636366", "seg-thumb-text": "#ffffff", "bg-glow": "none",
    }
  },
  graphite: {
    label: "Graphite (gradient rings)",
    style: "playful",
    mode: "dark",
    vars: {
      bg: "#1b1f27", surface: "#252a35", "surface-2": "#303643", text: "#e8ecf3", muted: "#8f98a8", border: "#363d4b",
      accent: "#38b6ff", "accent-text": "#0b1220", highlight: "#c03a74", "highlight-text": "#ffffff",
      "ring-a": "#e0568f", "ring-b": "#38b6ff", pr: "#f7c948", good: "#4ade80", bad: "#f87171",
      "seg-thumb": "#38b6ff", "seg-thumb-text": "#0b1220", font: ROUNDED, radius: "22px",
      "bg-glow": "linear-gradient(180deg, #1b1f27, #141820)",
    },
    alt: {
      bg: "#f3f5f8", surface: "#ffffff", "surface-2": "#e9edf2", text: "#171b22", muted: "#5a6474", border: "#dde2e9", accent: "#0369a1", "accent-text": "#ffffff", link: "#0369a1", highlight: "#be185d", "highlight-text": "#ffffff", "ring-a": "#e0568f", "ring-b": "#38b6ff", pr: "#b45309", good: "#15803d", bad: "#dc2626", "seg-thumb": "#0369a1", "seg-thumb-text": "#ffffff", "bg-glow": "linear-gradient(180deg, #f3f5f8, #eaeef3)",
    }
  },
  "pro-dark": {
    label: "Pro",
    style: "pro",
    mode: "dark",
    vars: {
      bg: "#0e1116", surface: "#151a21", "surface-2": "#1c222b", text: "#e6e9ef", muted: "#8b95a5", border: "#262d38",
      accent: "#2f6ae0", "accent-text": "#ffffff", link: "#7aa7ff", highlight: "#1a2433", "highlight-text": "#e6e9ef",
      "ring-a": "#4f8cff", "ring-b": "#4f8cff", pr: "#f0b429", good: "#3ecf8e", bad: "#f87171",
      "seg-thumb": "#2f3846", "seg-thumb-text": "#ffffff", font: APPLE, radius: "14px", "bg-glow": "none",
    },
    alt: {
      bg: "#f6f7f9", surface: "#ffffff", "surface-2": "#eef0f4", text: "#111827", muted: "#6b7280", border: "#e3e6eb", accent: "#2563eb", "accent-text": "#ffffff", link: "#2563eb", highlight: "#eef3ff", "highlight-text": "#1e3a8a", "ring-a": "#2563eb", "ring-b": "#2563eb", pr: "#b45309", good: "#047857", bad: "#dc2626", "seg-thumb": "#ffffff", "seg-thumb-text": "#111827", "bg-glow": "none",
    }
  },
  professional: {
    label: "Pro (light first)",
    style: "pro",
    mode: "light",
    vars: {
      bg: "#f6f7f9", surface: "#ffffff", "surface-2": "#eef0f4", text: "#111827", muted: "#6b7280", border: "#e3e6eb",
      accent: "#2563eb", "accent-text": "#ffffff", link: "#2563eb", highlight: "#eef3ff", "highlight-text": "#1e3a8a",
      "ring-a": "#2563eb", "ring-b": "#2563eb", pr: "#b45309", good: "#047857", bad: "#dc2626",
      "seg-thumb": "#ffffff", "seg-thumb-text": "#111827", font: APPLE, radius: "14px", "bg-glow": "none",
    },
    alt: {
      bg: "#0e1116", surface: "#151a21", "surface-2": "#1c222b", text: "#e6e9ef", muted: "#8b95a5", border: "#262d38", accent: "#2f6ae0", "accent-text": "#ffffff", link: "#7aa7ff", highlight: "#1a2433", "highlight-text": "#e6e9ef", "ring-a": "#4f8cff", "ring-b": "#4f8cff", pr: "#f0b429", good: "#3ecf8e", bad: "#f87171", "seg-thumb": "#2f3846", "seg-thumb-text": "#ffffff", "bg-glow": "none",
    }
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
