"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useApp } from "./AppProvider";

export function NavBar() {
  const path = usePathname();
  const { cfg } = useApp();
  const links = [
    { href: "/", label: "Today", ico: "🏋️" },
    { href: "/progress", label: "Progress", ico: "📈" },
    ...(cfg.friends.enabled ? [{ href: "/friends", label: "Friends", ico: "👥" }] : []),
    { href: "/split", label: "Split", ico: "🗓️" },
    { href: "/settings", label: "Settings", ico: "⚙️" },
  ];
  return (
    <nav className="nav">
      {links.map((l) => (
        <Link key={l.href} href={l.href} className={path === l.href ? "on" : ""} title={l.label} aria-label={l.label}>
          <span className="ico" aria-hidden>{l.ico}</span>
          <span className="lbl">{l.label}</span>
        </Link>
      ))}
    </nav>
  );
}
