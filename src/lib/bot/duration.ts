/** "2m", "90", "90s", "1:30", "1m30s", "2 min" → seconds; null if unparseable. */
export function parseDuration(input: string): number | null {
  const s = input.trim().toLowerCase().replace(/\s+/g, "");
  if (!s) return null;
  let m = s.match(/^(\d+):(\d{1,2})$/);
  if (m) return Number(m[1]) * 60 + Number(m[2]);
  m = s.match(/^(\d+)(?:s|sec|secs|seconds?)?$/);
  if (m) return Number(m[1]);
  m = s.match(/^(?:(\d+(?:\.\d+)?)(?:m|min|mins|minutes?))?(?:(\d+)(?:s|sec|secs|seconds?))?$/);
  if (m && (m[1] || m[2])) return Math.round(Number(m[1] ?? 0) * 60) + Number(m[2] ?? 0);
  return null;
}

export function formatDuration(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}
