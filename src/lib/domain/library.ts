import type { Category } from "@/config/app.config";

/**
 * The shared exercise library: names, category, equipment and synonyms
 * (the "thesaurus": what people actually type or call a lift). Matching for
 * /log, the shorthand box and imports checks synonyms too.
 *
 * Source of truth for both backends: the local backend seeds from this list,
 * and supabase/migrations/0012_exercise_library.sql is generated from it
 * (`npm run gen:library`).
 */
export interface LibraryExercise {
  name: string;
  category: Category;
  equipment: "barbell" | "dumbbell" | "machine" | "cable" | "bodyweight" | "kettlebell" | "band" | "smith" | "other";
  aliases: string[];
}

const L = (name: string, category: Category, equipment: LibraryExercise["equipment"], ...aliases: string[]): LibraryExercise => ({ name, category, equipment, aliases });

export const LIBRARY: LibraryExercise[] = [
  // ---------------------------------------------------------------- chest
  L("Bench Press", "upper", "barbell", "bench", "flat bench", "bb bench", "barbell bench", "bp", "flat barbell bench", "bench press (barbell)"),
  L("Incline Bench Press", "upper", "barbell", "incline bench", "incline barbell", "incline bb bench", "incline press"),
  L("Decline Bench Press", "upper", "barbell", "decline bench", "decline", "decline press"),
  L("Close-Grip Bench Press", "upper", "barbell", "close grip bench", "cgbp", "narrow grip bench"),
  L("Dumbbell Bench Press", "upper", "dumbbell", "db bench", "dumbbell bench", "flat db press", "db press"),
  L("Incline Dumbbell Press", "upper", "dumbbell", "incline db press", "incline db bench", "incline dumbbell bench"),
  L("Chest Fly Machine", "upper", "machine", "pec deck", "pec fly", "fly machine", "machine fly", "chest fly", "fly machine single"),
  L("Dumbbell Fly", "upper", "dumbbell", "db fly", "db flye", "flyes", "dumbbell flye"),
  L("Cable Crossover", "upper", "cable", "cable fly", "crossover", "cable flye"),
  L("Machine Chest Press", "upper", "machine", "chest press", "hammer strength press", "seated chest press"),
  L("Push-up", "upper", "bodyweight", "pushup", "push up", "press up"),
  L("Dip", "upper", "bodyweight", "dips", "chest dip", "parallel bar dip"),
  // ---------------------------------------------------------------- back
  L("Deadlift", "lower", "barbell", "dl", "conventional deadlift", "deadlifts"),
  L("Sumo Deadlift", "lower", "barbell", "sumo", "sumo dl"),
  L("Romanian Deadlift", "lower", "barbell", "rdl", "rdls", "romanian dl", "stiff leg deadlift", "sldl"),
  L("Rack Pull", "lower", "barbell", "rack pulls", "block pull"),
  L("Barbell Row", "upper", "barbell", "bent over row", "bb row", "bent-over row", "pendlay row", "bor"),
  L("Dumbbell Row", "upper", "dumbbell", "db row", "one arm row", "single arm row", "bench db row", "kroc row"),
  L("Seated Cable Row", "upper", "cable", "cable row", "seated row", "low row", "seated row single"),
  L("T-Bar Row", "upper", "machine", "tbar row", "t bar row", "landmine row"),
  L("Chest-Supported Row", "upper", "machine", "chest supported row", "seal row", "machine row"),
  L("Lat Pulldown", "upper", "cable", "pulldown", "lat pull down", "lat pull", "pull down"),
  L("Straight-Arm Pulldown", "upper", "cable", "straight arm pulldown", "lat prayer", "pullover cable"),
  L("Pull-up", "upper", "bodyweight", "pullup", "pull up", "pullups", "pull-ups"),
  L("Chin-up", "upper", "bodyweight", "chinup", "chin up", "chins"),
  L("Assisted Pull-up", "upper", "machine", "assisted pullup", "assisted chin up", "gravitron"),
  L("Inverted Row", "upper", "bodyweight", "australian pull up", "body row"),
  L("Face Pull", "upper", "cable", "face pulls", "rope face pull"),
  L("Back Extension", "lower", "bodyweight", "hyperextension", "hyper", "back raise", "45 degree back extension"),
  L("Good Morning", "lower", "barbell", "good mornings"),
  // ---------------------------------------------------------------- shoulders
  L("Overhead Press", "upper", "barbell", "ohp", "military press", "standing press", "bar shoulder press", "barbell shoulder press"),
  L("Seated Dumbbell Shoulder Press", "upper", "dumbbell", "db shoulder press", "dumbbell shoulder press", "seated db press", "db ohp"),
  L("Machine Shoulder Press", "upper", "machine", "shoulder press machine", "machine ohp"),
  L("Arnold Press", "upper", "dumbbell", "arnolds"),
  L("Push Press", "upper", "barbell", "pp"),
  L("Lateral Raise", "upper", "dumbbell", "lat raise", "side raise", "side lateral", "db lateral raise", "lateral raises"),
  L("Cable Lateral Raise", "upper", "cable", "cable lat raise", "cable side raise"),
  L("Machine Lateral Raise", "upper", "machine", "machine lat raise", "machine lat. raise", "lateral raise machine"),
  L("Lean-Away Lateral Raise", "upper", "dumbbell", "lean-away db lat raise", "lean away lateral raise", "lean away lat raise"),
  L("Front Raise", "upper", "dumbbell", "front raises", "db front raise"),
  L("Rear Delt Fly", "upper", "dumbbell", "rear delt raise", "reverse fly", "bent over fly", "rear fly"),
  L("Reverse Pec Deck", "upper", "machine", "rear pec deck", "r pec deck", "reverse fly machine", "rear delt machine"),
  L("Upright Row", "upper", "barbell", "upright rows"),
  L("Barbell Shrug", "upper", "barbell", "shrug", "shrugs", "bb shrug"),
  L("Dumbbell Shrug", "upper", "dumbbell", "db shrug", "db shrugs"),
  L("Cable Shrug", "upper", "cable", "cable shrugs"),
  L("Dead Hang", "upper", "bodyweight", "dead-hang", "bar hang", "passive hang"),
  // ---------------------------------------------------------------- arms
  L("Barbell Curl", "upper", "barbell", "bb curl", "curl", "curls", "barbell curls", "bicep curl", "biceps curl"),
  L("EZ-Bar Curl", "upper", "barbell", "ez curl", "ez bar curl"),
  L("Dumbbell Curl", "upper", "dumbbell", "db curl", "dumbbell curls", "alternating curl"),
  L("Hammer Curl", "upper", "dumbbell", "hammer curls", "hammers", "neutral grip curl"),
  L("Preacher Curl", "upper", "machine", "preacher", "preacher curls", "scott curl"),
  L("Incline Dumbbell Curl", "upper", "dumbbell", "incline curl", "incline db curl"),
  L("Cable Curl", "upper", "cable", "cable curls", "rope curl"),
  L("Concentration Curl", "upper", "dumbbell", "concentration curls"),
  L("Triceps Pushdown", "upper", "cable", "pushdown", "push down", "tricep pushdown", "cable pushdown", "rope pushdown", "rope pull down"),
  L("Overhead Triceps Extension", "upper", "cable", "overhead extension", "oh tricep extension", "french press", "overhead tricep"),
  L("Skull Crusher", "upper", "barbell", "skull crushers", "lying triceps extension", "ez skull crusher", "skullcrusher"),
  L("Triceps Dip Machine", "upper", "machine", "dip machine", "seated dip"),
  L("Wrist Curl", "upper", "dumbbell", "wrist curls", "forearm curl"),
  // ---------------------------------------------------------------- legs
  L("Back Squat", "lower", "barbell", "squat", "squats", "bb squat", "high bar squat", "low bar squat", "back squats"),
  L("Front Squat", "lower", "barbell", "front squats", "fs"),
  L("Goblet Squat", "lower", "dumbbell", "goblet", "goblet squats"),
  L("Hack Squat", "lower", "machine", "hack", "hack squats"),
  L("Smith Machine Squat", "lower", "smith", "smith squat"),
  L("Bulgarian Split Squat", "lower", "dumbbell", "bss", "split squat", "rear foot elevated split squat", "rfess", "bulgarians"),
  L("Leg Press", "lower", "machine", "legpress", "45 leg press", "sled press"),
  L("Leg Extension", "lower", "machine", "leg extensions", "quad extension", "knee extension"),
  L("Lying Leg Curl", "lower", "machine", "leg curl", "hamstring curl", "lying hamstring curl", "leg curls"),
  L("Seated Leg Curl", "lower", "machine", "seated hamstring curl"),
  L("Walking Lunge", "lower", "dumbbell", "lunges", "lunge", "walking lunges", "db lunge"),
  L("Reverse Lunge", "lower", "dumbbell", "reverse lunges", "step back lunge"),
  L("Step-up", "lower", "dumbbell", "step up", "step ups", "box step up"),
  L("Hip Thrust", "lower", "barbell", "hip thrusts", "barbell hip thrust", "glute bridge thrust"),
  L("Glute Bridge", "lower", "bodyweight", "glute bridges"),
  L("Hip Abduction", "lower", "machine", "abduction", "abductor", "abductors", "hip abductor", "outer thigh"),
  L("Hip Adduction", "lower", "machine", "adduction", "adductor", "adductors", "hip adductor", "inner thigh"),
  L("Calf Raise", "lower", "machine", "standing calf raise", "calf raises", "calves", "calf machine", "standing calves"),
  L("Seated Calf Raise", "lower", "machine", "seated calves", "seated calf"),
  L("Cable Kickback", "lower", "cable", "glute kickback", "kickbacks"),
  L("Nordic Curl", "lower", "bodyweight", "nordic", "nordics", "nordic hamstring curl"),
  L("Kettlebell Swing", "lower", "kettlebell", "kb swing", "swings", "kettlebell swings"),
  // ---------------------------------------------------------------- core
  L("Plank", "core", "bodyweight", "planks", "front plank"),
  L("Side Plank", "core", "bodyweight", "side planks"),
  L("Hanging Leg Raise", "core", "bodyweight", "leg raise", "hanging leg raises", "hlr", "toes to bar"),
  L("Cable Crunch", "core", "cable", "kneeling cable crunch", "rope crunch"),
  L("Crunch", "core", "bodyweight", "crunches", "sit up", "sit-up", "situps"),
  L("Ab Wheel Rollout", "core", "other", "ab wheel", "rollout", "ab roller"),
  L("Russian Twist", "core", "bodyweight", "russian twists"),
  L("Pallof Press", "core", "cable", "pallof"),
  L("Dead Bug", "core", "bodyweight", "deadbug", "dead bugs"),
  L("Hollow Hold", "core", "bodyweight", "hollow body", "hollow body hold"),
  // ---------------------------------------------------------------- calisthenics
  L("Muscle-up", "upper", "bodyweight", "muscle up", "muscleup"),
  L("Pike Push-up", "upper", "bodyweight", "pike pushup", "pike push up"),
  L("Handstand Push-up", "upper", "bodyweight", "hspu", "handstand pushup"),
  L("Pistol Squat", "lower", "bodyweight", "pistol", "pistols", "single leg squat"),
  L("L-Sit", "core", "bodyweight", "l sit", "lsit"),
  L("Burpee", "other", "bodyweight", "burpees"),
  // ---------------------------------------------------------------- full body / olympic / strongman
  L("Power Clean", "lower", "barbell", "clean", "cleans", "power cleans"),
  L("Clean and Jerk", "lower", "barbell", "c&j", "clean & jerk"),
  L("Snatch", "lower", "barbell", "power snatch"),
  L("Farmer's Carry", "other", "dumbbell", "farmers walk", "farmer walk", "farmers carry", "loaded carry"),
  L("Sled Push", "lower", "other", "prowler", "sled"),
  L("Thruster", "other", "barbell", "thrusters"),
  L("Turkish Get-up", "other", "kettlebell", "tgu", "turkish getup"),
  // ---------------------------------------------------------------- cardio
  L("Running", "cardio", "other", "run", "jog", "jogging"),
  L("Treadmill", "cardio", "machine", "treadmill run", "treadmill walk"),
  L("Walking", "cardio", "other", "walk", "incline walk"),
  L("Cycling", "cardio", "other", "bike", "cycle", "biking", "stationary bike", "spin"),
  L("Rowing Machine", "cardio", "machine", "rower", "erg", "row erg", "concept2"),
  L("Elliptical", "cardio", "machine", "cross trainer"),
  L("Stair Climber", "cardio", "machine", "stairmaster", "stairs", "stair stepper"),
  L("Swimming", "cardio", "other", "swim", "laps"),
  L("Jump Rope", "cardio", "other", "skipping", "jumprope", "double unders"),
];
