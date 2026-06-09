// ====================================================================
// SYSTEM METADATA & TRAINING ARCHITECTURE (GLOBAL DATA LAYER)
// ====================================================================

export const CONFIG = {
  stallSetReductionModifier: 0.8,
  weightIncrement: 2.5,
  repsIncrement: 1,
  fatigueRpeThreshold: 8.5,
  runPaceExponent: 1.06,
  rmCeilingMultiplier: 1.15
};

export const EXERCISE_LIBRARY = {
  Push: [
    "Bench Press", "Incline DB Press", "Standing Barbell OHP", "Standing OHP",
    "Seated DB Shoulder Press", "Dips", "Push-Ups", "Close-Grip Bench", "Incline Barbell Press",
    "Incline Bench Press", "Lateral Raise", "Tricep Band Pushdown", "Tricep Pushdown", 
    "Close-Grip Push-Ups", "Lying DB Tricep Extension"
  ],
  Pull: [
    "Deadlift", "Pull-Ups", "Barbell Bent-Over Row", "Barbell Row", "Single-Arm DB Row", 
    "Single Arm DB Row", "Lat Pulldown", "Chest Supported Dumbbell Row", "Chest Supported Row", 
    "Rear Delt Fly", "Face Pull", "Hammer Curl", "Barbell Curl (Heavy)", "Barbell Curl", 
    "Chin-Ups", "Incline DB Curl", "Barbell Biceps Curl (Light)", "Bicep Curl", "EZ Bar Curl"
  ],
  Legs: [
    "Back Squat", "Front Squat", "Romanian Deadlift", "Deficit Deadlift",
    "Bulgarian Split Squat", "Leg Press", "Calf Raises", "Dumbbell Lying Hamstring Curl", "Hamstring Curl"
  ],
  Accessories: [
    "Core/Plank", "Hanging Leg Raises", "Ab Wheel Rollouts", "Cable Crunches"
  ]
};

export const PROGRAMS = {
  "hybrid_strength_5k": {
    name: "Hybrid Strength & 5K Builder",
    totalWeeks: 12,
    dossier: {
      creator: "Custom Protocol",
      focus: "Strength, Muscle & 5K Performance",
      philosophy: "Build strength and muscle while improving 5K performance without prioritizing running. Emphasizes 1-2 RIR, compound progressions, and Zone 2 aerobic base."
    },
    days: {
      mon: { 
        title: "Push A", badge: "Push Focus", color: "var(--accent-blue)", 
        desc: "Bench Press (4×5), Standing OHP (3×6), Incline DB Press (3×8–10), Lateral Raise (3×12–15), Tricep Pushdown (3×12–15), Close-Grip Bench (2×10–12).", 
        runs: "Rest", 
        lifts: ["Bench Press", "Standing OHP", "Incline DB Press", "Lateral Raise", "Tricep Pushdown", "Close-Grip Bench"] 
      },
      tue: { 
        title: "Pull A", badge: "Pull Focus", color: "var(--accent-pink)", 
        desc: "Deadlift (3×5), Pull-Ups (4×Max), Chest Supported Row (3×8–10), Rear Delt Fly (3×15), Face Pull (3×15–20), Hammer Curl (3×10–12), Barbell Curl (3×8).", 
        runs: "Rest", 
        lifts: ["Deadlift", "Pull-Ups", "Chest Supported Row", "Rear Delt Fly", "Face Pull", "Hammer Curl", "Barbell Curl"] 
      },
      wed: { 
        title: "Legs", badge: "Lower Body", color: "var(--accent-green)", 
        desc: "Back Squat (4×5), Romanian Deadlift (3×8), Bulgarian Split Squat (3×8–10), Hamstring Curl (3×10–12), Calf Raises (4×15–20).", 
        runs: "Rest", 
        lifts: ["Back Squat", "Romanian Deadlift", "Bulgarian Split Squat", "Hamstring Curl", "Calf Raises"] 
      },
      thu: { 
        title: "Hard Run + Push B", badge: "Intervals & Push", color: "var(--accent-amber)", 
        desc: "Incline Bench Press (4×6), Seated DB Shoulder Press (3×8–10), Dips (3×Max), Lying DB Tricep Extension (3×10–12), Lateral Raise (3×15), Push-Ups (2–3 sets).", 
        runs: "🔥 Hard Run (Check week specific intervals)", 
        lifts: ["Incline Bench Press", "Seated DB Shoulder Press", "Dips", "Lying DB Tricep Extension", "Lateral Raise", "Push-Ups"] 
      },
      fri: { 
        title: "Pull B", badge: "Pull Focus", color: "var(--accent-blue)", 
        desc: "Barbell Row (4×5), Chin-Ups (4×Max), Single Arm DB Row (3×10), Incline DB Curl (3×10–12), EZ Bar Curl (3×12–15). Optional Core.", 
        runs: "Rest", 
        lifts: ["Barbell Row", "Chin-Ups", "Single Arm DB Row", "Incline DB Curl", "EZ Bar Curl", "Hanging Leg Raises"] 
      },
      sat: { 
        title: "Easy Long Run", badge: "Zone 2", color: "var(--accent-pink)", 
        desc: "Easy conversational pace (Zone 2).", 
        runs: "Zone 2 Long Run (See week specific duration)", 
        lifts: [] 
      },
      sun: { 
        title: "Rest", badge: "Recovery", color: "var(--text-muted)", 
        desc: "Recover. Sleep 7-9 hours. Walk, stretch or mobility if desired.", 
        runs: "Rest", 
        lifts: [] 
      }
    },
    weeklyVolModifiers: {
      "1": { sets: 4, reps: 5, intensityLabel: "Run: 5×800m (90s rest) | Long Run: 35–45m" },
      "2": { sets: 4, reps: 5, intensityLabel: "Run: 5×800m (90s rest) | Long Run: 35–45m" },
      "3": { sets: 4, reps: 5, intensityLabel: "Run: 5×800m (90s rest) | Long Run: 35–45m" },
      "4": { sets: 2, reps: 5, intensityLabel: "Deload: Lifts 50% Vol | Run 4×800m | Long 25-35m" },
      "5": { sets: 4, reps: 5, intensityLabel: "Run: 4×1KM (2m rest) | Long Run: 45–55m" },
      "6": { sets: 4, reps: 5, intensityLabel: "Run: 4×1KM (2m rest) | Long Run: 45–55m" },
      "7": { sets: 4, reps: 5, intensityLabel: "Run: 4×1KM (2m rest) | Long Run: 45–55m" },
      "8": { sets: 2, reps: 5, intensityLabel: "Deload: Lifts 50% Vol | Run 3×1KM | Long 35-45m" },
      "9": { sets: 4, reps: 5, intensityLabel: "Run: 3×1600m (3m rest) | Long Run: 50–65m" },
      "10": { sets: 4, reps: 5, intensityLabel: "Run: 3×1600m (3m rest) | Long Run: 50–65m" },
      "11": { sets: 4, reps: 5, intensityLabel: "Run: 3×1600m (3m rest) | Long Run: 50–65m" },
      "12": { sets: 4, reps: 5, intensityLabel: "Run: 3×1600m (3m rest) | Long Run: 50–65m" }
    }
  },
  "hybrid_engine": {
    name: "Sub-20 5K Hybrid Engine",
    totalWeeks: 9,
    dossier: {
      creator: "Hybrid Training Built-in",
      focus: "Concurrent Strength & Aerobic Capacity",
      philosophy: "A heavily balanced protocol designed to push your 5K pace below 20 minutes while maintaining maximal strength. It utilizes a base accumulation phase before shifting into lactate threshold intervals and heavy 5-rep max lifts."
    },
    days: {
      mon: { title: "Push A + Easy Run", badge: "Push Focus", color: "var(--accent-blue)", desc: "Targets: Bench Press (4x5), Standing Barbell OHP (3x6)...", runs: "Easy conversational run • 30–40 min", lifts: ["Bench Press", "Standing Barbell OHP", "Incline DB Press", "Lateral Raise", "Tricep Band Pushdown", "Close-Grip Bench"] },
      tue: { title: "Pull A + Intervals", badge: "Pull & VO2", color: "var(--accent-pink)", desc: "Targets: Deadlift (3x5), Pull-Ups (4x10)...", runs: "⚡ Intervals: Wks 1-3 (6x800m)", lifts: ["Deadlift", "Pull-Ups", "Chest Supported Dumbbell Row", "Rear Delt Fly", "Hammer Curl", "Barbell Curl (Heavy)"] },
      wed: { title: "Legs Power", badge: "Lower Body", color: "var(--accent-green)", desc: "Targets: Back Squat (4x5), Romanian Deadlift (3x8)...", runs: "💤 No running. Full recovery.", lifts: ["Back Squat", "Romanian Deadlift", "Bulgarian Split Squat", "Dumbbell Lying Hamstring Curl", "Calf Raises"] },
      thu: { title: "Tempo Run + Push B", badge: "Lactate Threshold", color: "var(--accent-amber)", desc: "Targets: Incline Barbell Press (4x6)...", runs: "🔥 Tempo: Comfortably hard", lifts: ["Incline Barbell Press", "Seated DB Shoulder Press", "Dips", "Lateral Raise", "Close-Grip Push-Ups"] },
      fri: { title: "Pull B + Easy Run", badge: "Hypertrophy", color: "var(--accent-blue)", desc: "Targets: Barbell Bent-Over Row (4x5)...", runs: "Easy conversational run • 30 min", lifts: ["Barbell Bent-Over Row", "Chin-Ups", "Single-Arm DB Row", "Incline DB Curl", "Barbell Biceps Curl (Light)"] },
      sat: { title: "Parkrun / Long Run", badge: "Volume Run", color: "var(--accent-pink)", desc: "Parkrun effort or Easy Aerobic Run.", runs: "Parkrun Effort OR 45-60m Easy Aerobic", lifts: [] },
      sun: { title: "Full Rest", badge: "System Rest", color: "var(--text-muted)", desc: "No lifting. No running.", runs: "Rest execution criteria verified.", lifts: [] }
    },
    weeklyVolModifiers: {
      "1": { sets: 3, reps: 8, intensityLabel: "Base Accumulation" },
      "2": { sets: 3, reps: 8, intensityLabel: "Base Accumulation" },
      "3": { sets: 3, reps: 8, intensityLabel: "Intensification" },
      "4": { sets: 2, reps: 8, intensityLabel: "Deload (40% Volume Reduction)" },
      "5": { sets: 3, reps: 8, intensityLabel: "Threshold Block" },
      "6": { sets: 3, reps: 8, intensityLabel: "Threshold Intensification" },
      "7": { sets: 3, reps: 8, intensityLabel: "Pace Accumulation" },
      "8": { sets: 2, reps: 8, intensityLabel: "Deload (40% Volume Reduction)" },
      "9": { sets: 2, reps: 5, intensityLabel: "5K Peak Performance Taper" }
    }
  },
  "ppl_hypertrophy": {
    name: "Push Pull Legs (Hypertrophy)",
    totalWeeks: 8,
    dossier: {
      creator: "Classic Blueprint",
      focus: "Volume & Muscle Mass",
      philosophy: "The gold standard 6-day split. By grouping muscles into Push, Pull, and Legs, you hit every muscle group twice a week. This maximizes muscle protein synthesis while allowing adequate recovery for each specific joint."
    },
    days: {
      mon: { title: "Push A", badge: "Hypertrophy", color: "var(--accent-blue)", desc: "Chest, Shoulders & Triceps.", runs: "Rest", lifts: ["Bench Press", "Incline DB Press", "Lateral Raise", "Tricep Band Pushdown"] },
      tue: { title: "Pull A", badge: "Hypertrophy", color: "var(--accent-pink)", desc: "Back & Biceps volume acceleration.", runs: "Rest", lifts: ["Deadlift", "Lat Pulldown", "Single-Arm DB Row", "Hammer Curl"] },
      wed: { title: "Legs A", badge: "Hypertrophy", color: "var(--accent-green)", desc: "Quads and calf focus metrics.", runs: "Rest", lifts: ["Back Squat", "Leg Press", "Bulgarian Split Squat", "Calf Raises"] },
      thu: { title: "System Rest", badge: "Recovery", color: "var(--text-muted)", desc: "Rest day.", runs: "Rest", lifts: [] },
      fri: { title: "Push B", badge: "Hypertrophy", color: "var(--accent-blue)", desc: "Vertical press overload configuration.", runs: "Rest", lifts: ["Standing Barbell OHP", "Dips", "Incline DB Press", "Lateral Raise"] },
      sat: { title: "Pull B", badge: "Hypertrophy", color: "var(--accent-pink)", desc: "Upper back density architecture.", runs: "Rest", lifts: ["Pull-Ups", "Barbell Bent-Over Row", "Rear Delt Fly", "Barbell Curl (Heavy)"] },
      sun: { title: "Legs B", badge: "Hypertrophy", color: "var(--accent-green)", desc: "Posterior chain tissue loading.", runs: "Rest", lifts: ["Romanian Deadlift", "Dumbbell Lying Hamstring Curl", "Bulgarian Split Squat", "Calf Raises"] }
    },
    weeklyVolModifiers: {
      "1": { sets: 3, reps: 12, intensityLabel: "Introductory Volume Baseline" },
      "2": { sets: 3, reps: 10, intensityLabel: "Load Acceleration Step" },
      "3": { sets: 4, reps: 10, intensityLabel: "Peak Volume Accumulation" },
      "4": { sets: 2, reps: 12, intensityLabel: "Mid-Phase Recovery Flush" },
      "5": { sets: 4, reps: 8,  intensityLabel: "Intensification Block Step 1" },
      "6": { sets: 4, reps: 8,  intensityLabel: "Intensification Block Step 2" },
      "7": { sets: 4, reps: 6,  intensityLabel: "Max Absolute Load Step" },
      "8": { sets: 2, reps: 10, intensityLabel: "Final Structural Deload" }
    }
  },
  "jacked_and_tan_2": {
    name: "GZCL: Jacked & Tan 2.0",
    totalWeeks: 12,
    dossier: {
      creator: "Cody Lefever (GZCL)",
      focus: "Powerbuilding & Rep Maxes",
      philosophy: "A brutal but incredibly fun powerbuilding wave. Each week, you hunt for a new Rep Max (e.g., finding your 10-Rep Max on Week 1, and your 8-Rep Max on Week 2) before dropping into high-volume back-off sets to build massive work capacity."
    },
    days: {
      mon: { title: "Day 1: Squat Hypertrophy", badge: "GZCL T1 Lower", color: "var(--accent-green)", desc: "T1 Back Squat day paired with deficit deadlift variations.", runs: "Rest", lifts: ["Back Squat", "Deficit Deadlift", "Leg Press", "Barbell Bent-Over Row", "Dumbbell Lying Hamstring Curl", "Calf Raises", "Hammer Curl"] },
      tue: { title: "Day 2: Bench Press Overload", badge: "GZCL T1 Upper Push", color: "var(--accent-blue)", desc: "Heavy volumetric horizontal push day.", runs: "Rest", lifts: ["Bench Press", "Close-Grip Bench", "Incline DB Press", "Seated DB Shoulder Press", "Lateral Raise", "Rear Delt Fly", "Tricep Band Pushdown"] },
      wed: { title: "Day 3: Mid-Week Decompression", badge: "Rest / Recovery", color: "var(--text-muted)", desc: "Scheduled rest day.", runs: "Rest", lifts: [] },
      thu: { title: "Day 4: Deadlift Capacity", badge: "GZCL T1 Pull Focus", color: "var(--accent-pink)", desc: "Heavy absolute pull mechanics framework.", runs: "Rest", lifts: ["Deadlift", "Front Squat", "Pull-Ups", "Single-Arm DB Row", "Dumbbell Lying Hamstring Curl", "Calf Raises", "Bicep Curl"] },
      fri: { title: "Day 5: Overhead Engine Expansion", badge: "GZCL T1 Upper Press", color: "var(--accent-amber)", desc: "Vertical structural press variation.", runs: "Rest", lifts: ["Standing Barbell OHP", "Incline Barbell Press", "Dips", "Seated DB Shoulder Press", "Lateral Raise", "Rear Delt Fly", "Tricep Band Pushdown"] },
      sat: { title: "Day 6: Aerobic Engine / Baseline Rest", badge: "System Decompression", color: "var(--text-muted)", desc: "Weekend macro recovery block initialization.", runs: "Rest", lifts: [] },
      sun: { title: "Day 7: Full System Rest", badge: "Macro Recovery", color: "var(--text-muted)", desc: "Complete central nervous system down-regulation phase validation.", runs: "Rest", lifts: [] }
    },
    weeklyVolModifiers: {
      "1": { sets: 4, reps: 10, intensityLabel: "Find 10-Rep Max Profile" },
      "2": { sets: 4, reps: 8,  intensityLabel: "Find 8-Rep Max Profile" },
      "3": { sets: 4, reps: 6,  intensityLabel: "Find 6-Rep Max Profile" },
      "4": { sets: 3, reps: 4,  intensityLabel: "Find 4-Rep Max Step" },
      "5": { sets: 5, reps: 2,  intensityLabel: "Find 2-Rep Max Overload" },
      "6": { sets: 3, reps: 1,  intensityLabel: "Find 1-Rep Absolute Max" },
      "7": { sets: 4, reps: 6,  intensityLabel: "Block 2: 6-RM Re-Assessment" },
      "8": { sets: 4, reps: 5,  intensityLabel: "Block 2: 5-RM Intensification" },
      "9": { sets: 4, reps: 4,  intensityLabel: "Block 2: 4-RM Peak Vol" },
      "10": { sets: 3, reps: 3, intensityLabel: "Block 2: 3-RM Absolute Overload" },
      "11": { sets: 3, reps: 2, intensityLabel: "Block 2: 2-RM Heavy Taper" },
      "12": { sets: 1, reps: 1, intensityLabel: "Absolute Meet / PR Peak Day" }
    }
  },
  "reddit_ppl": {
    name: "Reddit PPL (6-Day Push Pull Legs)",
    totalWeeks: 12,
    dossier: {
      creator: "Reddit Fitness Community",
      focus: "Beginner/Intermediate Aesthetics",
      philosophy: "One of the most battle-tested routines on the internet. It alternates between heavy, low-rep compound days and high-volume hypertrophy days to build a dense, aesthetic physique."
    },
    days: {
      mon: { title: "Push A (Heavy)", badge: "Reddit PPL", color: "var(--accent-blue)", desc: "Heavy Bench focus. Target 5x5 for Bench Press.", runs: "Rest", lifts: ["Bench Press", "Standing Barbell OHP", "Incline DB Press", "Tricep Band Pushdown", "Lateral Raise"] },
      tue: { title: "Pull A (Heavy)", badge: "Reddit PPL", color: "var(--accent-pink)", desc: "Heavy Deadlift focus. Target 1x5+ on Deadlifts.", runs: "Rest", lifts: ["Deadlift", "Lat Pulldown", "Barbell Bent-Over Row", "Hammer Curl", "Bicep Curl"] },
      wed: { title: "Legs A (Heavy)", badge: "Reddit PPL", color: "var(--accent-green)", desc: "Heavy Squat focus. Target 5x5+ on Squats.", runs: "Rest", lifts: ["Back Squat", "Romanian Deadlift", "Leg Press", "Calf Raises"] },
      thu: { title: "Push B (Volume)", badge: "Reddit PPL", color: "var(--accent-blue)", desc: "Volume OHP focus.", runs: "Rest", lifts: ["Standing Barbell OHP", "Bench Press", "Incline DB Press", "Tricep Band Pushdown", "Lateral Raise"] },
      fri: { title: "Pull B (Volume)", badge: "Reddit PPL", color: "var(--accent-pink)", desc: "Volume Back focus.", runs: "Rest", lifts: ["Barbell Bent-Over Row", "Lat Pulldown", "Hammer Curl", "Bicep Curl"] },
      sat: { title: "Legs B (Volume)", badge: "Reddit PPL", color: "var(--accent-green)", desc: "Volume Front/Back Squat focus.", runs: "Rest", lifts: ["Front Squat", "Romanian Deadlift", "Leg Press", "Calf Raises"] },
      sun: { title: "Rest", badge: "System Rest", color: "var(--text-muted)", desc: "Rest and recover.", runs: "Rest", lifts: [] }
    },
    weeklyVolModifiers: {
      "1": { sets: 4, reps: 8, intensityLabel: "Linear Progression Block" },
      "2": { sets: 4, reps: 8, intensityLabel: "Linear Progression Block" },
      "3": { sets: 4, reps: 8, intensityLabel: "Linear Progression Block" },
      "4": { sets: 4, reps: 8, intensityLabel: "Linear Progression Block" },
      "5": { sets: 4, reps: 8, intensityLabel: "Linear Progression Block" },
      "6": { sets: 4, reps: 8, intensityLabel: "Linear Progression Block" },
      "7": { sets: 4, reps: 8, intensityLabel: "Linear Progression Block" },
      "8": { sets: 4, reps: 8, intensityLabel: "Linear Progression Block" },
      "9": { sets: 4, reps: 8, intensityLabel: "Linear Progression Block" },
      "10": { sets: 4, reps: 8, intensityLabel: "Linear Progression Block" },
      "11": { sets: 4, reps: 8, intensityLabel: "Linear Progression Block" },
      "12": { sets: 4, reps: 8, intensityLabel: "Linear Progression Block" }
    }
  },
  "nsuns_531": {
    name: "nSuns 5/3/1 (4-Day)",
    totalWeeks: 12,
    dossier: {
      creator: "nSuns",
      focus: "Raw Strength Overload",
      philosophy: "Not for the faint of heart. nSuns uses a demanding 9-set progression scheme for main lifts based on Jim Wendler's 5/3/1 math. It forces rapid strength adaptation through sheer volume and heavy loads."
    },
    days: {
      mon: { title: "Volume Bench/OHP", badge: "nSuns", color: "var(--accent-blue)", desc: "High volume pressing.", runs: "Rest", lifts: ["Bench Press", "Standing Barbell OHP", "Incline DB Press"] },
      tue: { title: "Heavy Squat/Sumo", badge: "nSuns", color: "var(--accent-green)", desc: "Lower body max effort.", runs: "Rest", lifts: ["Back Squat", "Deficit Deadlift", "Leg Press", "Calf Raises"] },
      wed: { title: "Rest", badge: "Rest", color: "var(--text-muted)", desc: "Active recovery.", runs: "Rest", lifts: [] },
      thu: { title: "Heavy Bench/CGBP", badge: "nSuns", color: "var(--accent-blue)", desc: "Heavy benching.", runs: "Rest", lifts: ["Bench Press", "Close-Grip Bench", "Lateral Raise", "Tricep Band Pushdown"] },
      fri: { title: "Heavy Deadlift/Front Squat", badge: "nSuns", color: "var(--accent-pink)", desc: "Heavy deadlifts.", runs: "Rest", lifts: ["Deadlift", "Front Squat", "Barbell Bent-Over Row", "Hammer Curl"] },
      sat: { title: "Rest", badge: "Rest", color: "var(--text-muted)", desc: "Active recovery.", runs: "Rest", lifts: [] },
      sun: { title: "Rest", badge: "Rest", color: "var(--text-muted)", desc: "Active recovery.", runs: "Rest", lifts: [] }
    },
    weeklyVolModifiers: {
      "1": { sets: 9, reps: 3, intensityLabel: "Heavy 9-Set Scheme" },
      "2": { sets: 9, reps: 3, intensityLabel: "Heavy 9-Set Scheme" },
      "3": { sets: 9, reps: 3, intensityLabel: "Heavy 9-Set Scheme" },
      "4": { sets: 9, reps: 3, intensityLabel: "Heavy 9-Set Scheme" },
      "5": { sets: 9, reps: 3, intensityLabel: "Heavy 9-Set Scheme" },
      "6": { sets: 9, reps: 3, intensityLabel: "Heavy 9-Set Scheme" },
      "7": { sets: 9, reps: 3, intensityLabel: "Heavy 9-Set Scheme" },
      "8": { sets: 9, reps: 3, intensityLabel: "Heavy 9-Set Scheme" },
      "9": { sets: 9, reps: 3, intensityLabel: "Heavy 9-Set Scheme" },
      "10": { sets: 9, reps: 3, intensityLabel: "Heavy 9-Set Scheme" },
      "11": { sets: 9, reps: 3, intensityLabel: "Heavy 9-Set Scheme" },
      "12": { sets: 9, reps: 3, intensityLabel: "Heavy 9-Set Scheme" }
    }
  },
  "kong_savage_size": {
    name: "KONG: Savage Size (Alex Bromley)",
    totalWeeks: 12,
    dossier: {
      creator: "Alex Bromley",
      focus: "Savage Size & Hypertrophy",
      philosophy: "A 12-week size protocol split into 3 distinct phases. You will survive a 4-week Volumizing block, transition into a Pyramids block, and finally peak with heavy Reverse Pyramids. Eat big to survive this."
    },
    days: {
      mon: { title: "Chest & Shoulders", badge: "KONG", color: "var(--accent-blue)", desc: "Upper pressing mass.", runs: "Rest", lifts: ["Bench Press", "Incline DB Press", "Seated DB Shoulder Press", "Lateral Raise", "Push-Ups"] },
      tue: { title: "Back & Traps", badge: "KONG", color: "var(--accent-pink)", desc: "Back thickness.", runs: "Rest", lifts: ["Barbell Bent-Over Row", "Lat Pulldown", "Chest Supported Dumbbell Row", "Rear Delt Fly"] },
      wed: { title: "Quads & Calves", badge: "KONG", color: "var(--accent-green)", desc: "Legs size focus.", runs: "Rest", lifts: ["Back Squat", "Leg Press", "Bulgarian Split Squat", "Calf Raises"] },
      thu: { title: "Rest", badge: "Rest", color: "var(--text-muted)", desc: "Recovery.", runs: "Rest", lifts: [] },
      fri: { title: "Hamstrings & Glutes", badge: "KONG", color: "var(--accent-green)", desc: "Posterior chain.", runs: "Rest", lifts: ["Deadlift", "Romanian Deadlift", "Dumbbell Lying Hamstring Curl", "Calf Raises"] },
      sat: { title: "Arms & Core", badge: "KONG", color: "var(--accent-amber)", desc: "Gun show.", runs: "Rest", lifts: ["Hammer Curl", "Tricep Band Pushdown", "Bicep Curl", "Core/Plank"] },
      sun: { title: "Rest", badge: "Rest", color: "var(--text-muted)", desc: "Recovery.", runs: "Rest", lifts: [] }
    },
    weeklyVolModifiers: {
      "1": { sets: 3, reps: 10, intensityLabel: "Phase 1: Volumizing" },
      "2": { sets: 3, reps: 12, intensityLabel: "Phase 1: Volumizing" },
      "3": { sets: 4, reps: 10, intensityLabel: "Phase 1: Volumizing" },
      "4": { sets: 4, reps: 12, intensityLabel: "Phase 1: Volumizing" },
      "5": { sets: 4, reps: 8,  intensityLabel: "Phase 2: Pyramids" },
      "6": { sets: 4, reps: 8,  intensityLabel: "Phase 2: Pyramids" },
      "7": { sets: 5, reps: 6,  intensityLabel: "Phase 2: Pyramids" },
      "8": { sets: 5, reps: 6,  intensityLabel: "Phase 2: Pyramids" },
      "9": { sets: 3, reps: 5,  intensityLabel: "Phase 3: Reverse Pyramid" },
      "10": { sets: 3, reps: 5, intensityLabel: "Phase 3: Reverse Pyramid" },
      "11": { sets: 4, reps: 4, intensityLabel: "Phase 3: Reverse Pyramid" },
      "12": { sets: 4, reps: 4, intensityLabel: "Phase 3: Reverse Pyramid" }
    }
  },
  "custom_protocol": {
    name: "My Custom Training Protocol",
    totalWeeks: 12,
    dossier: {
      creator: "You",
      focus: "Custom Goals",
      philosophy: "A completely blank 12-week slate. Use this to build your own masterpiece, track a physical therapist's rehab routine, or experiment with your own wave loading."
    },
    days: {
      mon: { title: "Custom Day 1", badge: "Custom", color: "var(--accent-blue)", desc: "Enter your custom focus.", runs: "Rest", lifts: [] },
      tue: { title: "Custom Day 2", badge: "Custom", color: "var(--accent-pink)", desc: "Enter your custom focus.", runs: "Rest", lifts: [] },
      wed: { title: "Custom Day 3", badge: "Custom", color: "var(--accent-green)", desc: "Enter your custom focus.", runs: "Rest", lifts: [] },
      thu: { title: "Rest", badge: "Rest", color: "var(--text-muted)", desc: "Rest.", runs: "Rest", lifts: [] },
      fri: { title: "Custom Day 4", badge: "Custom", color: "var(--accent-amber)", desc: "Enter your custom focus.", runs: "Rest", lifts: [] },
      sat: { title: "Custom Day 5", badge: "Custom", color: "var(--accent-blue)", desc: "Enter your custom focus.", runs: "Rest", lifts: [] },
      sun: { title: "Rest", badge: "Rest", color: "var(--text-muted)", desc: "Rest.", runs: "Rest", lifts: [] }
    },
    weeklyVolModifiers: {
      "1": { sets: 3, reps: 10, intensityLabel: "Custom Block" },
      "2": { sets: 3, reps: 10, intensityLabel: "Custom Block" },
      "3": { sets: 3, reps: 10, intensityLabel: "Custom Block" },
      "4": { sets: 3, reps: 10, intensityLabel: "Custom Block" },
      "5": { sets: 3, reps: 10, intensityLabel: "Custom Block" },
      "6": { sets: 3, reps: 10, intensityLabel: "Custom Block" },
      "7": { sets: 3, reps: 10, intensityLabel: "Custom Block" },
      "8": { sets: 3, reps: 10, intensityLabel: "Custom Block" },
      "9": { sets: 3, reps: 10, intensityLabel: "Custom Block" },
      "10": { sets: 3, reps: 10, intensityLabel: "Custom Block" },
      "11": { sets: 3, reps: 10, intensityLabel: "Custom Block" },
      "12": { sets: 3, reps: 10, intensityLabel: "Custom Block" }
    }
  }
};

export const WEEK_PHASE_NAMES = {
  '1': 'Accumulation Phase', '2': 'Accumulation Phase', '3': 'Intensification Phase',
  '4': 'Deload Week', '5': 'Threshold Accumulation', '6': 'Threshold Intensification',
  '7': 'Goal Pace Accumulation', '8': 'Deload Week', '9': 'Peak / Taper Week',
  '10': 'Max Capacity Build', '11': 'Heavy Engine Taper', '12': 'Absolute Performance Peak'
};

export const DAY_NAMES_FULL = { 
  mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday', fri: 'Friday', sat: 'Saturday', sun: 'Sunday' 
};
