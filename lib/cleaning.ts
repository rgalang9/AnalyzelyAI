import type { Dataset } from "./parse-dataset";
import type { CleanRequest, FlaggedIssue, IssueReview } from "./cleaning-schema";
import { evenlySpaced, profileColumns, toNumber } from "./dataset-stats";
import { isMissing } from "./data-checks";

// ---------- Types ----------

export type IssueKind =
  | "missing"
  | "duplicate"
  | "wrong_type"
  | "spaces"
  | "capitalization"
  | "date_format"
  | "impossible_date"
  | "outlier";

export const ISSUE_LABELS: Record<IssueKind, string> = {
  missing: "Missing value",
  duplicate: "Duplicate row",
  wrong_type: "Wrong type",
  spaces: "Extra spaces",
  capitalization: "Capitalization",
  date_format: "Date format",
  impossible_date: "Impossible date",
  outlier: "Unusual value",
};

// A change we could make: put a new value in the cell, or drop a duplicate row
export type Fix = { type: "set"; value: string } | { type: "remove_row" };

export type Issue = {
  id: string;
  row: number; // position in dataset.rows (0 = first data row)
  col: number | null; // null = the whole row (duplicates)
  kind: IssueKind;
  problem: string; // what's wrong, in plain words
  advice: string; // what we suggest and why (or why we left it alone)
  fix: Fix | null; // null = only flagged, nothing to change
  certainty: "confident" | "suggestion";
};

// Everything about cleaning one dataset. The original rows are never changed:
// the cleaned version is the original with the fixes in `fixedIds` applied.
export type Cleaning = {
  issues: Issue[];
  fixedIds: string[];
  aiReviewed: boolean; // false if the AI double-check couldn't run
};

// ---------- Building the cleaned dataset ----------

export function applyFixes(dataset: Dataset, cleaning: Cleaning | null): Dataset {
  if (!cleaning || cleaning.fixedIds.length === 0) return dataset;
  const fixed = new Set(cleaning.fixedIds);
  const rows = dataset.rows.map((row) => [...row]);
  const removed = new Set<number>();

  for (const issue of cleaning.issues) {
    if (!issue.fix || !fixed.has(issue.id)) continue;
    if (issue.fix.type === "remove_row") removed.add(issue.row);
    else if (issue.col !== null) rows[issue.row][issue.col] = issue.fix.value;
  }

  return { ...dataset, rows: rows.filter((_, i) => !removed.has(i)) };
}

// ---------- Filling missing values (the app does the math, not the AI) ----------

type FillMethod = "fill_median" | "fill_mean" | "fill_most_common" | "fill_previous" | "fill_next";

const FILL_LABELS: Record<FillMethod, string> = {
  fill_median: "column median",
  fill_mean: "column average",
  fill_most_common: "most common value",
  fill_previous: "value from the row above",
  fill_next: "value from the row below",
};

// Rounds to 2 decimals and drops trailing zeros: 42.50 → "42.5"
function plainNumber(n: number) {
  return String(Number(n.toFixed(2)));
}

function computeFill({ rows }: Dataset, row: number, col: number, method: FillMethod): string | null {
  const filled = rows.map((r) => r[col].trim()).filter((v) => !isMissing(v));

  if (method === "fill_previous" || method === "fill_next") {
    const step = method === "fill_previous" ? -1 : 1;
    for (let i = row + step; i >= 0 && i < rows.length; i += step) {
      if (!isMissing(rows[i][col])) return rows[i][col].trim();
    }
    return null;
  }

  if (method === "fill_most_common") {
    const counts = new Map<string, number>();
    for (const v of filled) counts.set(v, (counts.get(v) ?? 0) + 1);
    let best: string | null = null;
    for (const [v, n] of counts) if (best === null || n > counts.get(best)!) best = v;
    return best;
  }

  const nums = filled.map(toNumber).filter((n) => n !== null);
  if (nums.length === 0) return null;
  if (method === "fill_mean") return plainNumber(nums.reduce((a, b) => a + b, 0) / nums.length);
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return plainNumber(sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2);
}

// ---------- Asking the AI to double-check ----------

const MAX_AI_ISSUES = 80;
const SAMPLE_ROWS = 15;
const CELL_CHARS = 100;

// Extra spaces are clear-cut, so they skip the AI review
export function needsReview(issue: Issue) {
  return issue.kind !== "spaces";
}

// Picks up to MAX_AI_ISSUES, taking turns between each column + kind,
// so a column with 500 blanks doesn't crowd out everything else
function pickForReview(issues: Issue[]): Issue[] {
  const groups = new Map<string, Issue[]>();
  for (const issue of issues.filter(needsReview)) {
    const key = `${issue.kind}:${issue.col}`;
    groups.set(key, [...(groups.get(key) ?? []), issue]);
  }
  const picked: Issue[] = [];
  const lists = [...groups.values()];
  for (let i = 0; picked.length < MAX_AI_ISSUES && lists.some((l) => i < l.length); i++) {
    for (const list of lists) {
      if (i < list.length && picked.length < MAX_AI_ISSUES) picked.push(list[i]);
    }
  }
  return picked;
}

const clip = (v: string, max = CELL_CHARS) => v.slice(0, max);

function describeIssue({ headers, rows }: Dataset, issue: Issue): FlaggedIssue {
  const { row, col } = issue;
  return {
    id: issue.id,
    row: row + 1,
    column: col === null ? null : headers[col],
    kind: issue.kind,
    value: col === null ? null : clip(rows[row][col]),
    problem: issue.problem,
    code_fix:
      issue.fix?.type === "set" ? clip(issue.fix.value) : issue.fix?.type === "remove_row" ? "remove row" : null,
    row_values: clip(rows[row].map((v, i) => `${headers[i]}: ${clip(v, 40)}`).join(" | "), 1000),
    above: col === null || row === 0 ? null : clip(rows[row - 1][col]),
    below: col === null || row === rows.length - 1 ? null : clip(rows[row + 1][col]),
  };
}

// Sends the flagged cells to the AI and returns the issues updated with its review.
// Throws if the AI can't be reached (the caller keeps the code-only results).
export async function reviewIssues(dataset: Dataset, issues: Issue[]): Promise<Issue[]> {
  const picked = pickForReview(issues);
  const body: CleanRequest = {
    fileName: dataset.fileName,
    totalRows: dataset.rows.length,
    headers: dataset.headers,
    profile: profileColumns(dataset),
    sampleRows: evenlySpaced(dataset.rows, SAMPLE_ROWS).map((row) => row.map((v) => clip(v))),
    issues: picked.map((issue) => describeIssue(dataset, issue)),
  };

  const response = await fetch("/api/clean", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error ?? "AI review failed");

  return mergeReviews(dataset, issues, result.reviews as IssueReview[]);
}

// Turns the AI's decision into a concrete fix, or null if there's nothing safe to change
function resolveFix(dataset: Dataset, issue: Issue, review: IssueReview): Fix | null {
  const { action } = review;
  if (action === "remove_row") return issue.col === null ? { type: "remove_row" } : null;
  if (issue.col === null || action === "leave_as_is") return null;
  if (action === "set_value") {
    if (review.value === null || review.value === dataset.rows[issue.row][issue.col]) return null;
    return { type: "set", value: review.value };
  }
  const value = computeFill(dataset, issue.row, issue.col, action);
  return value === null ? null : { type: "set", value };
}

function reviewed(dataset: Dataset, issue: Issue, review: IssueReview): Issue {
  const fix = resolveFix(dataset, issue, review);
  const isFill = review.action.startsWith("fill_") && fix?.type === "set";
  return {
    ...issue,
    problem: review.problem || issue.problem,
    advice: isFill
      ? `${review.advice} (Filled with the ${FILL_LABELS[review.action as FillMethod]}: ${fix.value})`
      : review.advice,
    fix,
    certainty: review.certainty,
  };
}

function mergeReviews(dataset: Dataset, issues: Issue[], reviews: IssueReview[]): Issue[] {
  const byId = new Map(reviews.map((r) => [r.id, r]));

  // The AI only sees some of the missing cells. If it chose the same fill method
  // for every one it saw in a column, use that method for the rest of the column too.
  const columnFill = new Map<number, IssueReview | "mixed">();
  for (const issue of issues) {
    const review = byId.get(issue.id);
    if (!review || issue.kind !== "missing" || issue.col === null) continue;
    const seen = columnFill.get(issue.col);
    if (seen === undefined) columnFill.set(issue.col, review);
    else if (seen !== "mixed" && (seen.action !== review.action || seen.certainty !== review.certainty)) {
      columnFill.set(issue.col, "mixed");
    }
  }

  const result: Issue[] = [];
  for (const issue of issues) {
    const review = byId.get(issue.id);
    if (review) {
      if (review.is_problem) result.push(reviewed(dataset, issue, review));
      continue; // not a real problem: drop the flag
    }
    const fill = issue.kind === "missing" && issue.col !== null ? columnFill.get(issue.col) : undefined;
    if (fill && fill !== "mixed" && fill.action.startsWith("fill_")) {
      result.push(reviewed(dataset, issue, { ...fill, problem: issue.problem }));
    } else {
      result.push(issue); // not reviewed: keep the code check's result
    }
  }
  return result;
}
