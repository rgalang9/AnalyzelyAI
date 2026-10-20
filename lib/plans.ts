// Plan limits live here, and only here. To change a limit, edit a number below.

const MB = 1024 * 1024;

export type PlanId = "free" | "pro";

export type Plan = {
  name: string;
  maxCells: number; // rows × columns
  maxFileSizeBytes: number;
  priceMonthly: number; // US dollars
  active: boolean; // false = not available to anyone yet
};

export const PLANS: Record<PlanId, Plan> = {
  free: {
    name: "Free",
    maxCells: 3_000,
    maxFileSizeBytes: 2 * MB,
    priceMonthly: 0,
    active: true,
  },
  // Placeholder for later. Nobody is put on this plan yet.
  pro: {
    name: "Pro",
    maxCells: 100_000,
    maxFileSizeBytes: 20 * MB,
    priceMonthly: 5,
    active: false,
  },
};

// Everyone (guests and logged-in users) is on Free for now.
// When Pro launches, this is where we'll look up the user's real plan.
export function getCurrentPlan(): Plan {
  return PLANS.free;
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
export function checkFileSize(
  sizeBytes: number,
  plan = getCurrentPlan()
): LimitProblem | null {
  if (sizeBytes <= plan.maxFileSizeBytes) return null;
  return {
    detail: `It's ${formatMB(sizeBytes)}`,
    limit: formatMB(plan.maxFileSizeBytes),
    planName: plan.name.toLowerCase(),
  };
}

// Returns what's wrong if there are too many cells, or null if it's fine.
export function checkCellCount(
  cells: number,
  plan = getCurrentPlan()
): LimitProblem | null {
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
