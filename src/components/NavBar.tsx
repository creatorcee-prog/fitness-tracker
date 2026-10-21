"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useApp } from "./AppProvider";
import { Icon, type IconName } from "./Icon";

export function NavBar() {
  const path = usePathname();
  const { cfg } = useApp();
  const links: { href: string; label: string; ico: IconName }[] = [
    { href: "/", label: "Today", ico: "lift" },
    { href: "/progress", label: "Progress", ico: "progress" },
    ...(cfg.friends.enabled ? [{ href: "/friends", label: "Friends", ico: "friends" as const }] : []),
    { href: "/split", label: "Split", ico: "split" },
    { href: "/settings", label: "Settings", ico: "settings" },
  ];
  return (
    <nav className="nav">
      {links.map((l) => (
        <Link key={l.href} href={l.href} className={path === l.href ? "on" : ""} title={l.label} aria-label={l.label}>
          <span className="ico"><Icon name={l.ico} /></span>
          <span className="lbl">{l.label}</span>
        </Link>
      ))}
    </nav>
  );
}
