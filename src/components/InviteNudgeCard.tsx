"use client";

import Link from "next/link";
import { recruiterBadge } from "@/lib/domain/invites";
import { useApp } from "./AppProvider";

/** Settings → Reminders: James's occasional "invite a friend" ask, and your recruiter badge. */
export function InviteNudgeCard() {
  const { cfg, store, profile, setProfile } = useApp();
  const inv = profile.invites;
  if (store.kind === "local") return null;
  if (!inv) return <div className="card"><h2>Invite nudges</h2><p className="muted small">Needs migration 0016.</p></div>;
  const badge = recruiterBadge(inv.recruits);
  return (
    <div className="card stack">
      <h2>Invite nudges</h2>
      <p className="muted small" style={{ margin: 0 }}>
        About once a month at most, while you&apos;re training regularly and have few friends here, {cfg.brand.botName} may suggest sharing your invite link.
        It&apos;s a simple rule in the app: no person and no AI looks at who your friends are.
      </p>
      <label className="row small">
        <input type="checkbox" checked={inv.nudges} onChange={async (e) => setProfile(await store.updateProfile({ invites: { ...inv, nudges: e.target.checked } }))} /> Invite nudges
      </label>
      <div className="small">
        {badge ? <><span aria-hidden>{badge.emoji}</span> <strong>{badge.label}</strong> · </> : null}
        You&apos;ve brought in {inv.recruits} {inv.recruits === 1 ? "person" : "people"}.{" "}
        {!badge && <span className="muted">Bring 1 friend for the 📣 Recruiter badge, 3 for 🤝 Crew Builder, 5 for 🏅 Gym Ambassador.</span>}{" "}
        <Link href="/friends#invite">Invite a friend</Link>
      </div>
    </div>
  );
}
