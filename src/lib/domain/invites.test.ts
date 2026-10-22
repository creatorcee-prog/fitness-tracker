import { describe, expect, it } from "vitest";
import { recruiterBadge, shouldNudgeInvite } from "./invites";
import type { Session } from "./types";

const NOW = new Date("2026-10-21T12:00:00Z");
const s = (daysAgo: number): Session => ({ id: String(daysAgo), splitDayId: null, startedAt: new Date(NOW.getTime() - daysAgo * 86_400_000).toISOString(), finishedAt: new Date(NOW.getTime() - daysAgo * 86_400_000 + 3_600_000).toISOString(), source: "web" });
const rules = { everyDays: 30, minSessions: 3, withinDays: 14, maxFriends: 2 };
const base = { sessions: [s(1), s(4), s(8)], friends: 0, nudges: true, nudgedAt: null, now: NOW };

describe("shouldNudgeInvite", () => {
  it("asks active lifters with few friends", () => expect(shouldNudgeInvite(base, rules)).toBe(true));
  it("not if switched off, already social, or not training", () => {
    expect(shouldNudgeInvite({ ...base, nudges: false }, rules)).toBe(false);
    expect(shouldNudgeInvite({ ...base, friends: 3 }, rules)).toBe(false);
    expect(shouldNudgeInvite({ ...base, sessions: [s(1), s(20), s(30)] }, rules)).toBe(false);
  });
  it("at most once a month", () => {
    expect(shouldNudgeInvite({ ...base, nudgedAt: new Date(NOW.getTime() - 10 * 86_400_000).toISOString() }, rules)).toBe(false);
    expect(shouldNudgeInvite({ ...base, nudgedAt: new Date(NOW.getTime() - 31 * 86_400_000).toISOString() }, rules)).toBe(true);
  });
});

describe("recruiterBadge", () => {
  it("has tiers", () => {
    expect(recruiterBadge(0)).toBeNull();
    expect(recruiterBadge(1)?.label).toBe("Recruiter");
    expect(recruiterBadge(4)?.label).toBe("Crew Builder");
    expect(recruiterBadge(9)?.label).toBe("Gym Ambassador");
  });
});
