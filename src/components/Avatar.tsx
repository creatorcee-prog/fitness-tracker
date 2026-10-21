/** Initial on a colour derived from the person's id, so each friend is recognisable at a glance. */
export function Avatar({ id, name, size = 44 }: { id: string; name: string; size?: number }) {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const hue = h % 360;
  return (
    <div
      className="avatar"
      aria-hidden
      style={{ width: size, height: size, fontSize: size * 0.4, color: "#fff", background: `linear-gradient(135deg, hsl(${hue} 70% 58%), hsl(${(hue + 40) % 360} 70% 45%))` }}
    >
      {name.trim().slice(0, 1).toUpperCase() || "?"}
    </div>
  );
}
