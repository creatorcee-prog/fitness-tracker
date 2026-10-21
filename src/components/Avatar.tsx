/** Profile photo if there is one, else an initial on a colour derived from the person's id. */
export function Avatar({ id, name, size = 44, src }: { id: string; name: string; size?: number; src?: string | null }) {
  if (src) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img className="avatar" src={src} alt="" aria-hidden width={size} height={size} style={{ width: size, height: size, objectFit: "cover" }} />;
  }
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
