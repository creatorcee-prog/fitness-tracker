/**
 * Font choices (Settings → Look & feel → Font). Only the chosen font is
 * downloaded; the picker's previews fetch just the few letters they show.
 * `google` is the Google Fonts family spec; null = already on the device.
 */
export interface FontChoice {
  id: string;
  label: string;
  note: string;
  stack: string;
  google: string | null;
}

const SYSTEM = '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", Roboto, system-ui, sans-serif';

export const FONTS: FontChoice[] = [
  { id: "theme", label: "Theme default", note: "Whatever your theme uses", stack: "", google: null },
  { id: "system", label: "System", note: "SF Pro on iPhone, Roboto on Android. Nothing to download", stack: SYSTEM, google: null },
  { id: "outfit", label: "Outfit", note: "Rounded and friendly", stack: `"Outfit", ${SYSTEM}`, google: "Outfit:wght@400;500;600;700" },
  { id: "inter", label: "Inter", note: "Clean and neutral", stack: `"Inter", ${SYSTEM}`, google: "Inter:wght@400;500;600;700" },
  { id: "manrope", label: "Manrope", note: "Modern, slightly wide", stack: `"Manrope", ${SYSTEM}`, google: "Manrope:wght@400;500;600;700;800" },
  { id: "dm-sans", label: "DM Sans", note: "Geometric, compact", stack: `"DM Sans", ${SYSTEM}`, google: "DM+Sans:wght@400;500;600;700" },
  { id: "space-grotesk", label: "Space Grotesk", note: "Techy, quirky numbers", stack: `"Space Grotesk", ${SYSTEM}`, google: "Space+Grotesk:wght@400;500;600;700" },
  { id: "sora", label: "Sora", note: "Wide with bold numbers", stack: `"Sora", ${SYSTEM}`, google: "Sora:wght@400;500;600;700" },
  { id: "barlow", label: "Barlow", note: "Sporty, like a scoreboard", stack: `"Barlow", ${SYSTEM}`, google: "Barlow:wght@400;500;600;700;800" },
  { id: "rubik", label: "Rubik", note: "Soft corners, chunky", stack: `"Rubik", ${SYSTEM}`, google: "Rubik:wght@400;500;600;700" },
  { id: "lexend", label: "Lexend", note: "Designed to be easy to read", stack: `"Lexend", ${SYSTEM}`, google: "Lexend:wght@400;500;600;700" },
  { id: "atkinson", label: "Atkinson Hyperlegible", note: "Made for low vision; very distinct letters", stack: `"Atkinson Hyperlegible", ${SYSTEM}`, google: "Atkinson+Hyperlegible:wght@400;700" },
  { id: "jetbrains", label: "JetBrains Mono", note: "Monospace, for the nerds", stack: `"JetBrains Mono", ui-monospace, monospace`, google: "JetBrains+Mono:wght@400;500;600;700" },
];

export const fontById = (id: string) => FONTS.find((f) => f.id === id) ?? FONTS[0];

/** Stylesheet URL for one font, or only the given characters of several (cheap previews). */
export function googleFontsUrl(fonts: FontChoice[], text?: string): string | null {
  const fams = fonts.map((f) => f.google).filter((g): g is string => !!g);
  if (!fams.length) return null;
  return `https://fonts.googleapis.com/css2?${fams.map((g) => `family=${g}`).join("&")}&display=swap${text ? `&text=${encodeURIComponent(text)}` : ""}`;
}
