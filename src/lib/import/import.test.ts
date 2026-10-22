import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { fromKg } from "@/lib/domain/units";
import { defaultConfig as cfg } from "@/config/app.config";
import { aiEnvFromProcess } from "@/lib/ai/ask";
import { FakeData } from "@/lib/bot/testing";
import { LocalStore } from "@/lib/store/local";
import { readWithJames } from "./ai";
import { buildImport, guessCategory } from "./build";
import { detectCsv, isProgramCsv, parseCsv, readProgramCsv, readWorkoutCsv } from "./csv";
import { inferProgram } from "./infer";
import { applyAnswer, questionsFor } from "./questions";
import { readAnything } from "./read";
import { findDate, parseGoalLine, readWorkoutText } from "./text";
import type { ImportedSession } from "./types";
import { validateImported } from "./validate";

const NOW = new Date("2026-10-21T12:00:00");
class Mem {
  m = new Map<string, string>();
  getItem = (k: string) => this.m.get(k) ?? null;
  setItem = (k: string, v: string) => void this.m.set(k, v);
}
let n = 0;
const id = () => `id-${++n}`;

const STRONG = `Date,Workout Name,Duration,Exercise Name,Set Order,Weight,Reps,Distance,Seconds,Notes,Workout Notes,RPE
2026-09-01 18:02:11,"Push",1h,"Bench Press (Barbell)",W,95,10,0,0,,,
2026-09-01 18:02:11,"Push",1h,"Bench Press (Barbell)",1,185,5,0,0,,,8
2026-09-01 18:02:11,"Push",1h,"Bench Press (Barbell)",2,185,5,0,0,,,
2026-09-01 18:02:11,"Push",1h,"Treadmill",1,0,0,1.5,600,,,
2026-09-03 18:00:00,"Pull",1h,"Deadlift (Barbell)",1,315,5,0,0,"felt ""heavy""",,`;

const HEVY = `"title","start_time","end_time","description","exercise_title","superset_id","exercise_notes","set_index","set_type","weight_kg","reps","distance_km","duration_seconds","rpe"
"Upper A","15 Sep 2026, 08:30","15 Sep 2026, 09:30","","Bench Press (Barbell)","","","0","warmup","40","10","","",""
"Upper A","15 Sep 2026, 08:30","15 Sep 2026, 09:30","","Bench Press (Barbell)","","","1","normal","80","6","","","8.5"`;

describe("CSV", () => {
  it("parses quotes, escaped quotes and semicolons", () => {
    expect(parseCsv('a,"b, c","d ""e"""\n1,2,3')).toEqual([["a", "b, c", 'd "e"'], ["1", "2", "3"]]);
    expect(parseCsv("a;b\n1;2")).toEqual([["a", "b"], ["1", "2"]]);
  });
  it("reads a Strong export: sessions by date+name, warm-ups, RPE, skips cardio rows", () => {
    expect(detectCsv(STRONG)).toBe("strong-csv");
    const d = readWorkoutCsv(STRONG, "lb");
    expect(d.sessions.map((s) => [s.date, s.time, s.dayName, s.sets.length])).toEqual([["2026-09-01", "18:02", "Push", 3], ["2026-09-03", "18:00", "Pull", 1]]);
    expect(d.sessions[0].sets[0]).toMatchObject({ exercise: "Bench Press (Barbell)", weight: 95, warmup: true });
    expect(d.sessions[0].sets[1]).toMatchObject({ weight: 185, reps: 5, rpe: 8, unit: "lb", warmup: false });
    expect(d.skipped.join()).toContain("Treadmill");
  });
  it("reads a Hevy export with kg weights", () => {
    expect(detectCsv(HEVY)).toBe("hevy-csv");
    const d = readWorkoutCsv(HEVY, "lb");
    expect(d.sessions).toHaveLength(1);
    expect(d.sessions[0]).toMatchObject({ date: "2026-09-15", time: "08:30", dayName: "Upper A" });
    expect(d.sessions[0].sets[1]).toMatchObject({ weight: 80, unit: "kg", reps: 6, rpe: 8.5 });
    expect(d.sessions[0].sets[0].warmup).toBe(true);
  });
});

describe("notes reader", () => {
  it("finds dates in common formats, never in the future, and not in rep lists", () => {
    expect(findDate("Oct 14 - Push", NOW)).toEqual({ date: "2026-10-14", rest: "Push" });
    expect(findDate("Mon 11/3", NOW)?.date).toBe("2025-11-03"); // Nov 3 2026 hasn't happened yet
    expect(findDate("2026-01-05 legs", NOW)).toEqual({ date: "2026-01-05", rest: "legs" });
    expect(findDate("3rd March 2025", NOW)?.date).toBe("2025-03-03");
    expect(findDate("bench 185 5/5/5", NOW)).toBeNull();
  });
  it("reads goals", () => {
    expect(parseGoalLine("Goal: bench 225 by 2027-03-01", "lb", NOW)).toEqual({ type: "add_goal", goal: "lift_e1rm", lift: "Bench", target: 225, deadline: "2027-03-01" });
    expect(parseGoalLine("goal - 4 sessions a week", "lb", NOW)).toEqual({ type: "add_goal", goal: "sessions_per_week", target: 4 });
    expect(parseGoalLine("Goal: 12 pull-ups", "lb", NOW)).toMatchObject({ goal: "lift_reps", lift: "Pull-ups", target: 12, weight: 0 });
    expect(parseGoalLine("Goal: squat 140kg", "lb", NOW)).toMatchObject({ goal: "lift_e1rm", target: 308.6 });
  });
  it("reads a typical log faithfully", () => {
    const d = readWorkoutText(`Goal: bench 225 by 2027-03-01

Oct 14 - Push
Bench press 185x5x3
OHP: 115 8,8,7
Incline DB press
60x10, 60x9
Dips 3x10

Oct 16 - Pull day
Deadlift 315x5
- Barbell row 155x8x3
Pull-ups 3x8
felt great today`, "lb", NOW);
    expect(d.sessions.map((s) => [s.date, s.dayName])).toEqual([["2026-10-14", "Push"], ["2026-10-16", "Pull"]]);
    const push = d.sessions[0].sets;
    expect(push.filter((s) => s.exercise === "Bench press").map((s) => [s.weight, s.reps])).toEqual([[185, 5], [185, 5], [185, 5]]);
    expect(push.filter((s) => s.exercise === "OHP").map((s) => s.reps)).toEqual([8, 8, 7]);
    expect(push.filter((s) => s.exercise === "Incline DB press").map((s) => [s.weight, s.reps])).toEqual([[60, 10], [60, 9]]);
    expect(push.filter((s) => s.exercise === "Dips").map((s) => [s.weight, s.reps])).toEqual([[0, 10], [0, 10], [0, 10]]);
    expect(d.sessions[1].sets.filter((s) => s.exercise === "Pull-ups")).toHaveLength(3);
    expect(d.goals).toHaveLength(1);
    expect(d.skipped).toEqual(["felt great today"]);
  });
  it("reads a written program (no dates) as the stated split", () => {
    const d = readWorkoutText("Push\nBench 4x6-8\nOHP 3 x 8-10\n\nPull\nRows 4x8\nPull-ups 3x8-12", "lb", NOW);
    expect(d.sessions).toHaveLength(0);
    expect(d.program).toEqual({
      name: "Imported program", mode: "rotation", source: "stated",
      days: [
        { name: "Push", weekday: null, exercises: [{ name: "Bench", sets: 4, reps: "6-8" }, { name: "OHP", sets: 3, reps: "8-10" }] },
        { name: "Pull", weekday: null, exercises: [{ name: "Rows", sets: 4, reps: "8" }, { name: "Pull-ups", sets: 3, reps: "8-12" }] },
      ],
    });
  });
});

const sess = (date: string, dayName: string | null, lifts: [string, number, number[]][]): ImportedSession => ({
  date, time: null, dayName, sets: lifts.flatMap(([exercise, weight, reps]) => reps.map((r) => ({ exercise, weight, unit: "lb" as const, reps: r, rpe: null, warmup: false }))),
});

describe("inferProgram", () => {
  it("keeps your day names, order, lifts, usual sets and real rep range; weekly when days stick to weekdays", () => {
    // Mon/Wed/Fri for three weeks starting Mon 2026-09-07.
    const s: ImportedSession[] = [];
    for (let w = 0; w < 3; w++) {
      const d = (o: number) => new Date(Date.UTC(2026, 8, 7 + w * 7 + o)).toISOString().slice(0, 10);
      s.push(sess(d(0), "Push", [["Bench", 185, [8, 7, 6]], ["OHP", 115, [10, 9]]]));
      s.push(sess(d(2), "Pull", [["Row", 155, [8, 8, 8]]]));
      s.push(sess(d(4), "Legs", [["Squat", 225, [5, 5, 5]]]));
    }
    s.push(sess("2026-09-28", "Push", [["Bench", 190, [8, 6, 6]], ["OHP", 115, [9, 9]], ["Cable fly", 30, [15]]])); // a one-off extra lift
    const p = inferProgram(s)!;
    expect(p.mode).toBe("weekly");
    expect(p.days.map((d) => [d.name, d.weekday])).toEqual([["Pull", 3], ["Legs", 5], ["Push", 1]]);
    expect(p.days.find((d) => d.name === "Push")!.exercises).toEqual([{ name: "Bench", sets: 3, reps: "6-8" }, { name: "OHP", sets: 2, reps: "9-10" }]);
    expect(p.days.find((d) => d.name === "Legs")!.exercises).toEqual([{ name: "Squat", sets: 3, reps: "5" }]);
  });
  it("groups unnamed workouts by their lifts into a rotation", () => {
    const s = [
      sess("2026-10-01", null, [["Bench", 185, [5]], ["Row", 155, [8]]]),
      sess("2026-10-02", null, [["Squat", 225, [5]], ["RDL", 185, [8]]]),
      sess("2026-10-04", null, [["Bench", 185, [5]], ["Row", 155, [8]]]),
      sess("2026-10-06", null, [["Squat", 230, [5]], ["RDL", 185, [8]]]),
    ];
    const p = inferProgram(s)!;
    expect(p.mode).toBe("rotation");
    expect(p.days.map((d) => [d.name, d.exercises.map((x) => x.name)])).toEqual([["Day A", ["Bench", "Row"]], ["Day B", ["Squat", "RDL"]]]);
  });
});

describe("buildImport", () => {
  it("matches lifts conservatively and creates the rest with the written name", async () => {
    const store = new LocalStore(cfg, new Mem());
    const ex = await store.listExercises();
    const data = readWorkoutText("Oct 14 - Push\nBench 185x5\nOHP 115x8\nPress 100x5\nMoon squat 135x5", "lb", NOW);
    const { preview } = buildImport(data, inferProgram(data.sessions), ex, { history: true, program: true, activate: false, goals: true }, cfg, id);
    const byName = Object.fromEntries(preview.lifts.map((l) => [l.name, l.existing]));
    expect(byName.Bench).toBe("Bench Press");
    expect(byName.OHP).toBe("Overhead Press"); // alias
    expect(byName.Press).toBeNull(); // too vague to guess
    expect(byName["Moon squat"]).toBeNull();
    expect(guessCategory("Moon squat")).toBe("lower");
    // "Same as" in the preview maps it to one of yours instead.
    const squat = ex.find((e) => /squat/i.test(e.name))!;
    const again = buildImport(data, null, ex, { history: true, program: false, activate: false, goals: false }, cfg, id, { "moon squat": squat.id });
    expect(again.preview.lifts.find((l) => l.name === "Moon squat")?.existing).toBe(squat.name);

  });
  it("imports into the local store, merges, rebuilds PRs, and is safe to repeat", async () => {
    const store = new LocalStore(cfg, new Mem());
    const data = readWorkoutCsv(STRONG, "lb");
    const choices = { history: true, program: true, activate: false, goals: false };
    const first = buildImport(data, inferProgram(data.sessions), await store.listExercises(), choices, cfg, id);
    expect(await store.importAll(first.exportData)).toEqual({ sessions: 2, sets: 4, skipped: 0 });
    const splitsAfter = await store.listSplits();
    expect(splitsAfter.some((s) => s.name === "Imported split")).toBe(true);
    // Strong's "Bench Press (Barbell)" is a library synonym, so it logs under Bench Press (no duplicate lift).
    expect(first.preview.lifts.find((l) => l.name === "Bench Press (Barbell)")?.existing).toBe("Bench Press");
    expect((await store.listExercises()).some((e) => e.name === "Bench Press (Barbell)")).toBe(false);
    const again = buildImport(data, null, await store.listExercises(), { ...choices, program: false }, cfg, id);
    expect(await store.importAll(again.exportData)).toEqual({ sessions: 0, sets: 0, skipped: 2 });
  });
});

describe("James import", () => {
  it("validates model output: drops bad rows into skipped, expands n, keeps stated program", () => {
    const d = validateImported({
      sessions: [
        { date: "2026-10-14", day: "Push", sets: [{ e: "Bench", w: 185, u: "lb", r: 5, n: 3 }, { e: "Bad", w: -5, r: 5 }, { e: "Dips", w: 0, r: 10, n: 99 }] },
        { date: "Tuesday", sets: [{ e: "Squat", w: 225, r: 5 }] },
      ],
      program: { name: "PPL", mode: "weekly", days: [{ name: "Push", weekday: 1, exercises: [{ e: "Bench", sets: 4, reps: "6 – 8" }] }] },
      goals: [{ goal: "lift_e1rm", lift: "Bench", target: 225, deadline: null }, { goal: "lift_e1rm", lift: "Bench", target: "lots" }],
      unclear: ["felt great"],
    }, "lb");
    expect(d.sessions).toHaveLength(1);
    expect(d.sessions[0].sets).toHaveLength(3);
    expect(d.program).toMatchObject({ name: "PPL", mode: "weekly", days: [{ name: "Push", weekday: 1, exercises: [{ name: "Bench", sets: 4, reps: "6-8" }] }] });
    expect(d.goals).toEqual([{ type: "add_goal", goal: "lift_e1rm", lift: "Bench", target: 225 }]);
    expect(d.skipped.length).toBe(4); // unclear + bad weight + n=99 + no date
  });
  it("keeps terms James isn't sure about, and turns them into questions", () => {
    const d = validateImported({ sessions: [], program: { name: "Mine", mode: "rotation", days: [{ name: "RE", exercises: [{ e: "Face pull", sets: null, reps: null, w: 40, detail: "x2" }] }] }, terms: [{ term: "RE", options: ["Rest", "Recovery"] }], goals: [] }, "lb");
    expect(d.program!.days[0]).toMatchObject({ name: "RE", code: "RE" });
    expect(d.program!.days[0].exercises[0]).toMatchObject({ detail: "x2", stated: false, weight: 40 });
    expect(questionsFor(d, d.program).map((q) => q.key)).toEqual(["term:re", "detail:x2", "setsreps"]);
  });
  it("reads photos with the image model (a setting), validating images first", async () => {
    const data = new FakeData();
    const bodies: Record<string, unknown>[] = [];
    const fetchFn = (async (_u: string, init: RequestInit) => {
      bodies.push(JSON.parse(String(init.body)));
      return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ sessions: [{ date: "2026-10-14", day: "Push", sets: [{ e: "Bench", w: 185, r: 5, n: 3 }] }], unclear: ["OHP 1?5 x 8"] }) } }], usage: { prompt_tokens: 2600, completion_tokens: 300 } }), { status: 200 });
    }) as unknown as typeof fetch;
    const env = { ...aiEnvFromProcess({ GROQ_VISION_MODEL: "vision/test-model" } as unknown as NodeJS.ProcessEnv), apiKey: "k", fallbackModel: "text/fallback" };
    const deps = { data, cfg, env, importEnv: { maxChars: 8000, maxOutputTokens: 3500 }, now: NOW, userId: "u1", fetch: fetchFn };
    const jpeg = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQ==";
    const r = await readWithJames(deps, "", [jpeg]);
    expect(r.ok && r.data.sessions[0].sets).toHaveLength(3);
    expect(r.ok && r.data.skipped).toEqual(["OHP 1?5 x 8"]); // unreadable bits are listed, not guessed
    expect(bodies[0].model).toBe("vision/test-model");
    const content = (bodies[0].messages as { content: unknown }[])[1].content as { type: string; image_url?: { url: string } }[];
    expect(content.map((c) => c.type)).toEqual(["text", "image_url"]);
    expect(content[1].image_url!.url).toBe(jpeg);
    expect(await readWithJames(deps, "", [jpeg, jpeg, jpeg])).toMatchObject({ ok: false, outcome: "bad-image" }); // max 2 by default
    expect(await readWithJames(deps, "", ["data:text/html;base64,PHNjcmlwdD4="])).toMatchObject({ ok: false, outcome: "bad-image" });
    expect(await readWithJames({ ...deps, env: { ...env, visionModel: "" } }, "", [jpeg])).toMatchObject({ ok: false, outcome: "disabled" });
    expect(bodies).toHaveLength(1); // rejected requests never reach the provider
  });
  it("calls the model in JSON mode within the caps and records usage", async () => {
    const data = new FakeData();
    const bodies: Record<string, unknown>[] = [];
    const fetchFn = (async (_u: string, init: RequestInit) => {
      bodies.push(JSON.parse(String(init.body)));
      return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ sessions: [{ date: "2026-10-14", day: "Push", sets: [{ e: "Bench", w: 185, r: 5, n: 3 }] }], program: null, goals: [], unclear: [] }) } }], usage: { prompt_tokens: 800, completion_tokens: 300 } }), { status: 200 });
    }) as unknown as typeof fetch;
    const env = { ...aiEnvFromProcess({} as NodeJS.ProcessEnv), apiKey: "k" };
    const r = await readWithJames({ data, cfg, env, importEnv: { maxChars: 8000, maxOutputTokens: 3500 }, now: NOW, userId: "u1", fetch: fetchFn }, "Oct 14 push: bench 3 sets of 5 at 185");
    expect(r.ok && r.data.sessions[0].sets).toHaveLength(3);
    expect(bodies[0]).toMatchObject({ response_format: { type: "json_object" }, max_completion_tokens: 3500, temperature: 0 });
    expect((await data.aiUsageToday("u1", NOW.toISOString().slice(0, 10))).user).toBe(1);
    const long = await readWithJames({ data, cfg, env, importEnv: { maxChars: 10, maxOutputTokens: 3500 }, now: NOW, userId: "u1", fetch: fetchFn }, "x".repeat(50));
    expect(long).toMatchObject({ ok: false, outcome: "too-long" });
  });
});

describe("program tables (a split spreadsheet)", () => {
  // Real-world example: weekday, focus code, section, exercise, weight, detail. No dates, sets or reps.
  const CSV = readFileSync(join(__dirname, "fixtures/program-table.csv"), "utf8");
  const defaults = { sets: 3, reps: "8-12" };

  it("is recognised as a program, not a log", () => {
    expect(detectCsv(CSV)).toBeNull();
    expect(isProgramCsv(CSV)).toBe(true);
    expect(isProgramCsv(STRONG)).toBe(false);
  });
  it("keeps every day, exercise, weight and note as written, on its weekday", () => {
    const d = readProgramCsv(CSV, "lb", defaults);
    const p = d.program!;
    expect(d.skipped).toEqual([]);
    expect(d.sessions).toEqual([]);
    expect(p.mode).toBe("weekly");
    expect(p.days.map((x) => [x.name, x.weekday, x.exercises.length])).toEqual([
      ["RE (Sun)", 0, 5], ["Chest", 1, 10], ["Back", 2, 10], ["Legs", 3, 12], ["RE (Thu)", 4, 5], ["Shoulders", 5, 8], ["Arms", 6, 12],
    ]);
    const mon = p.days[1].exercises;
    expect(mon[0]).toMatchObject({ name: "Dead-hang", weight: null, note: "30s", sets: 3, reps: "8-12", stated: false });
    expect(mon[1]).toMatchObject({ name: "Machine Shoulder Press", weight: 90, unit: "lb", note: null });
    expect(p.days[0].code).toBe("RE"); // not guessed: asked about
    expect(p.days[0].exercises[1]).toMatchObject({ name: "DB Shoulder Press", weight: 40, note: null, detail: "x2" });
    expect(p.days[2].exercises.find((x) => x.name === "Bent Over Row")).toMatchObject({ weight: null, note: null });
    expect(p.days[5].exercises.map((x) => x.name)).toContain("Lifty Arm Thingy");
  });
  it("reads stated sets × reps from a detail column", () => {
    const d = readProgramCsv("Day,Exercise,Weight,Detail\nMon,Bench,185,4x6-8\nWed,Squat,100kg,", "lb", defaults);
    expect(d.program!.days[0].exercises[0]).toMatchObject({ sets: 4, reps: "6-8", stated: true, weight: 185, note: null });
    expect(d.program!.days[1].exercises[0]).toMatchObject({ weight: 100, unit: "kg", stated: false });
  });
  it("asks instead of guessing, and applies the answers", () => {
    const d = readProgramCsv(CSV, "lb", defaults);
    const qs = questionsFor(d, d.program);
    expect(qs.map((q) => q.key)).toEqual(["term:re", "detail:x2", "setsreps"]);
    expect(qs[0].prompt).toContain("Sun, Thu");
    let p = applyAnswer(d.program!, "term:re", "Rear delts");
    expect(p.days.map((x) => x.name)).toEqual(["Rear delts (Sun)", "Chest", "Back", "Legs", "Rear delts (Thu)", "Shoulders", "Arms"]);
    p = applyAnswer(p, "detail:x2", "sets");
    p = applyAnswer(p, "setsreps", "4x6-10");
    const sun = p.days[0].exercises;
    expect(sun[1]).toMatchObject({ name: "DB Shoulder Press", sets: 2, reps: "6-10", detail: null }); // x2 = 2 sets, reps from the default answer
    expect(sun[2]).toMatchObject({ sets: 4, reps: "6-10" });
    const pair = applyAnswer(d.program!, "detail:x2", "pair");
    expect(pair.days[0].exercises[1]).toMatchObject({ sets: 3, note: "2 dumbbells (per hand)" });
    expect(d.program!.days[0].name).toBe("RE (Sun)"); // answers never mutate the original
  });
  it("reads copied spreadsheet cells (tab-separated)", () => {
    const tsv = CSV.split("\n").map((l) => l.split(",").join("\t")).join("\n");
    expect(isProgramCsv(tsv)).toBe(true);
    expect(readProgramCsv(tsv, "lb", defaults).program!.days).toHaveLength(7);
  });
  it("remembers answers locally", async () => {
    const store = new LocalStore(cfg, new Mem());
    await store.rememberImportAnswers({ "term:re": "Recovery" });
    expect(await store.importMemory(["term:re", "setsreps"])).toEqual({ mine: { "term:re": "Recovery" }, popular: {} });
  });
  it("saves start weights and notes into the split", async () => {
    const store = new LocalStore(cfg, new Mem());
    const d = readProgramCsv(CSV, "lb", defaults);
    const { exportData } = buildImport(d, d.program, await store.listExercises(), { history: false, program: true, activate: true, goals: false }, cfg, id);
    await store.importAll(exportData);
    const split = (await store.listSplits()).find((s) => s.name === "Imported program")!;
    const chest = split.days.find((x) => x.name === "Chest")!;
    expect(chest.exercises[0]).toMatchObject({ note: "30s", startWeightKg: null });
    expect(fromKg(chest.exercises[1].startWeightKg!, "lb")).toBeCloseTo(90, 5);
  });
});

describe("readAnything", () => {
  it("picks the right reader and only hands off to James when the result is thin", () => {
    const d = { sets: 3, reps: "8-12" };
    expect(readAnything(STRONG, "lb", NOW, d)).toMatchObject({ data: { format: "strong-csv" }, needsJames: false });
    expect(readAnything(readFileSync(join(__dirname, "fixtures/program-table.csv"), "utf8"), "lb", NOW, d)).toMatchObject({ data: { format: "program-csv" }, needsJames: false });
    expect(readAnything("Oct 14 - Push\nBench 185x5x3", "lb", NOW, d).needsJames).toBe(false);
    expect(readAnything("monday i did chest, worked up to two plates on bench for a few\ntuesday back, rows felt heavy\nwednesday off\nthursday legs", "lb", NOW, d).needsJames).toBe(true);
  });
});
