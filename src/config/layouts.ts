import type { WidgetConfig, WidgetId } from "./app.config";

/**
 * Starting layouts for Today's widgets (Edit → Layouts). Most people never
 * customize, so these are good defaults to pick from rather than build.
 */
const w = (id: WidgetId, size: 1 | 2 = 1, color = "surface"): WidgetConfig => ({ id, enabled: true, size, color });

export const LAYOUT_PRESETS: { id: string; label: string; description: string; widgets: WidgetConfig[] }[] = [
  { id: "lifter", label: "Lifter", description: "Your day, week, streak, latest PR and goals", widgets: [w("today", 2, "hero"), w("week", 1, "lime"), w("streak"), w("lastPr"), w("topLift"), w("goals", 2)] },
  { id: "minimal", label: "Minimal", description: "Just today and the week", widgets: [w("today", 2, "hero"), w("week", 2, "lime")] },
  { id: "nutrition", label: "Nutrition", description: "Calories and bodyweight up front", widgets: [w("today", 2, "hero"), w("calories", 2), w("bodyweight"), w("week", 1, "lime")] },
  { id: "social", label: "With friends", description: "Who's lifting today, streaks and PRs", widgets: [w("today", 2, "hero"), w("friends", 1, "lime"), w("streak"), w("lastPr", 2)] },
];

export const WIDGET_INFO: Record<string, { label: string; description: string }> = {
  today: { label: "Today's split day", description: "What's on today; tap to jump to the workout" },
  week: { label: "Sessions this week", description: "Progress toward your weekly target" },
  streak: { label: "Weekly streak", description: "Weeks in a row on target, with freezes" },
  lastPr: { label: "Latest PR", description: "Your most recent record" },
  friends: { label: "Friends lifting today", description: "How many friends have trained" },
  topLift: { label: "Top e1RM", description: "Your strongest lift" },
  volume: { label: "Weekly volume", description: "Total weight moved this week" },
  calories: { label: "Calories today", description: "Quick-add calories without leaving Today" },
  goals: { label: "Goals", description: "Your top goals with progress" },
  bodyweight: { label: "Bodyweight", description: "Latest weight and trend; log it right on the tile" },
};
