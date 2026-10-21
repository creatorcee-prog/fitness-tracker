/**
 * Custom CSS (Settings → Advanced). Restyling only: @import and any url()
 * that isn't an inline data: URL are removed, so pasted CSS can't load
 * anything from the internet (CSS can leak page content through image requests).
 */
export const MAX_CSS_CHARS = 20_000;

export function sanitizeCss(css: string): string {
  return css
    .slice(0, MAX_CSS_CHARS)
    // CSS escapes can spell url( or @import in disguise (\75 rl(…)); drop them before checking.
    .replace(/\\[0-9a-f]{1,6}\s?/gi, "")
    .replace(/\\(?=[a-z@(])/gi, "")
    .replace(/image-set\([^)]*\)/gi, "none")
    .replace(/@import[^;]*;?/gi, "/* @import removed */")
    .replace(/url\(\s*(['"]?)(?!data:)[^)]*\)/gi, "none /* external url removed */")
    // Belt and braces: no web addresses at all.
    .replace(/https?:\/\/[^\s)"';]+/gi, "")
    .replace(/<\/style/gi, "<\\/style");
}
