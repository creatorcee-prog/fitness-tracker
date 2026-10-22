import type { Session } from "./types";

/**
 * When James asks you to invite a friend. These are plain rules run in the app
 * (not the AI, and no person looks at who's friends with whom): only people
 * who are training regularly, have few friends on the app, haven't been asked
 * in a month, and haven't switched it off.
 */
export interface InviteRules {
  everyDays: number;
  minSessions: number;
  withinDays: number;
  maxFriends: number;
}

export function shouldNudgeInvite(
  o: { sessions: Session[]; friends: number; nudges: boolean; nudgedAt: string | null; now: Date },
  rules: InviteRules,
): boolean {
  if (!o.nudges || o.friends > rules.maxFriends) return false;
  const DAY = 86_400_000;
  if (o.nudgedAt && o.now.getTime() - Date.parse(o.nudgedAt) < rules.everyDays * DAY) return false;
  const since = o.now.getTime() - rules.withinDays * DAY;
  return o.sessions.filter((s) => s.finishedAt && Date.parse(s.startedAt) >= since).length >= rules.minSessions;
}

/** Badge for people you brought in (shown on your profile and to friends). Cosmetic only. */
export function recruiterBadge(recruits: number): { emoji: string; label: string } | null {
  if (recruits >= 5) return { emoji: "🏅", label: "Gym Ambassador" };
  if (recruits >= 3) return { emoji: "🤝", label: "Crew Builder" };
  if (recruits >= 1) return { emoji: "📣", label: "Recruiter" };
  return null;
}
