"use client";

import Link from "next/link";
import { describeGoal } from "@/lib/domain/goalText";
import { useApp } from "./AppProvider";
import { GoalRow, useGoals } from "./GoalsCard";
import { useMascot } from "./Mascot";

/** Today dashboard: the two goals closest to done (unfinished first). */
export function GoalsWidget() {
  const { profile } = useApp();
  const mascot = useMascot();
  const { data } = useGoals((g, liftName) => mascot.say("goal_hit", { goal: describeGoal(g, liftName, profile.unit) }));
  if (!data) return <span className="label">Goals</span>;
  const top = [...data.goals]
    .sort((a, b) => Number(data.progress.get(a.id)!.achieved && !data.progress.get(a.id)!.weekly) - Number(data.progress.get(b.id)!.achieved && !data.progress.get(b.id)!.weekly) || data.progress.get(b.id)!.pct - data.progress.get(a.id)!.pct)
    .slice(0, 2);
  return (
    <div style={{ display: "grid", gap: 10 }}>
      <div className="spread">
        <span className="label">Goals</span>
        <Link href="/progress#goals" className="small tap-pad" style={{ fontWeight: 600 }}>{data.goals.length ? "All goals ›" : "+ Add a goal"}</Link>
      </div>
      {!data.goals.length && <span className="foot">Set a target like “Bench 225” or “3 sessions a week”.</span>}
      {top.map((g) => (
        <GoalRow key={g.id} goal={g} p={data.progress.get(g.id)!} liftName={g.exerciseId ? data.exercises.get(g.exerciseId)?.name ?? null : null} unit={profile.unit} />
      ))}
    </div>
  );
}
