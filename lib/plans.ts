// Plan limits live here, and only here. To change a limit, edit a number below.

const MB = 1024 * 1024;

export type PlanId = "free" | "pro" | "premium";

export type Plan = {
  name: string;
  priceMonthly: number; // US dollars
  maxLessonLevel: number; // the last Level this plan can open (Infinity = all lessons)
  lessonsText: string;
  dailyCaseText: string; // shown in the plans pop-up; the Daily Case feature isn't built yet
  aiQuestionsPerMonth: number;
  aiDailyUses: number; // AI data cleanings a day, and the same number of AI auto-titles a day
  maxCells: number; // rows × columns
  maxFileSizeBytes: number; // the live site can't receive uploads over 4.5 MB, so stay under that
};

export const PLANS: Record<PlanId, Plan> = {
  free: {
    name: "Free",
    priceMonthly: 0,
    maxLessonLevel: 1,
    lessonsText: "Level 1 of every course",
    dailyCaseText: "Today's daily case",
    aiQuestionsPerMonth: 10,
    aiDailyUses: 5,
    maxCells: 3_000,
    maxFileSizeBytes: 2 * MB,
  },
  pro: {
    name: "Pro",
    priceMonthly: 4.99,
    maxLessonLevel: Infinity,
    lessonsText: "All lessons",
    dailyCaseText: "Last 30 days of daily cases",
    aiQuestionsPerMonth: 50,
    aiDailyUses: 30,
    maxCells: 10_000,
    maxFileSizeBytes: 4 * MB,
  },
  premium: {
    name: "Premium",
    priceMonthly: 9.99,
    maxLessonLevel: Infinity,
    lessonsText: "All lessons",
    dailyCaseText: "Full daily case archive with solutions",
    aiQuestionsPerMonth: 100,
    aiDailyUses: 60,
    maxCells: 50_000,
    maxFileSizeBytes: 4 * MB,
  },
};

// A value read from the database or a request, checked before we rely on it
export const isPlanId = (value: unknown): value is PlanId =>
  value === "free" || value === "pro" || value === "premium";

// Can this plan open a lesson of this Level? (Level 0 is the intro lesson some courses start with)
export const canOpenLevel = (planId: PlanId, level: number) =>
  level <= PLANS[planId].maxLessonLevel;

// One plan's list of features, for the plans pop-up
export function planFeatures(plan: Plan) {
  return [
    plan.lessonsText,
    plan.dailyCaseText,
    `${plan.aiQuestionsPerMonth} AI questions a month`,
    `Files up to ${plan.maxCells.toLocaleString("en-US")} cells`,
  ];
}

// Describes what went over the limit, ready to drop into a sentence:
// `${detail}, and the ${planName} limit is ${limit}.`
export type LimitProblem = {
  detail: string; // e.g. "It has 4,200 cells"
  limit: string; // e.g. "3,000"
  planName: string; // e.g. "free"
};

function formatMB(bytes: number) {
  return `${(bytes / MB).toFixed(1).replace(/\.0$/, "")} MB`;
}

// Returns what's wrong if the file is too big, or null if it's fine.
export function checkFileSize(sizeBytes: number, plan: Plan): LimitProblem | null {
  if (sizeBytes <= plan.maxFileSizeBytes) return null;
  return {
    detail: `It's ${formatMB(sizeBytes)}`,
    limit: formatMB(plan.maxFileSizeBytes),
    planName: plan.name.toLowerCase(),
  };
}

// Returns what's wrong if there are too many cells, or null if it's fine.
export function checkCellCount(cells: number, plan: Plan): LimitProblem | null {
  if (cells <= plan.maxCells) return null;
  return {
    detail: `It has ${cells.toLocaleString("en-US")} cells`,
    limit: plan.maxCells.toLocaleString("en-US"),
    planName: plan.name.toLowerCase(),
  };
}

// The same problem as one plain sentence (used where there's no pop-up)
export function limitMessage(problem: LimitProblem) {
  return `This file is over the limit. ${problem.detail}, and the ${problem.planName} limit is ${problem.limit}.`;
}
