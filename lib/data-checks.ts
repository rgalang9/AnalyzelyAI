import type { Dataset } from "./parse-dataset";
import type { Issue } from "./cleaning";
import { formatNumber, toNumber } from "./dataset-stats";

// Code-based checks that run on every cell. They only catch clear-cut patterns;
// the AI then reviews the flags in context (see lib/cleaning.ts).

// ---------- Small helpers ----------

const MISSING_WORDS = new Set(["", "n/a", "na", "null", "none", "nan", "-", "--", "?", "undefined", "missing"]);

// Blank cells and placeholders like "N/A" count as missing
export function isMissing(value: string) {
  return MISSING_WORDS.has(value.trim().toLowerCase());
}

const short = (v: string) => (v.length > 40 ? `${v.slice(0, 40)}…` : v);

// A column counts as numbers (or dates) when at least this share of filled cells are
const TYPE_THRESHOLD = 0.8;

type AddIssue = (issue: Omit<Issue, "id">) => void;

// ---------- Dates ----------

type DateRead =
  | { raw: string; key: string; kind: "ymd"; y: number; m: number; d: number; sep: string }
  | { raw: string; key: string; kind: "ab"; a: number; b: number; y: number; sep: string } // a/b order unknown
  | { raw: string; key: "words"; kind: "words"; y: number; m: number; d: number }
  | { raw: string; key: "time"; kind: "time" };

const MONTH_NAME = /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\b/i;

// Recognizes the common date styles and remembers which style each one uses
function readDate(raw: string): DateRead | null {
  const v = raw.trim();
  let match = v.match(/^(\d{4})([-/.])(\d{1,2})\2(\d{1,2})$/);
  if (match) {
    const [, y, sep, m, d] = match;
    return { raw: v, key: `Y${sep}M${sep}D`, kind: "ymd", y: +y, m: +m, d: +d, sep };
  }
  match = v.match(/^(\d{1,2})([-/.])(\d{1,2})\2(\d{4})$/);
  if (match) {
    const [, a, sep, b, y] = match;
    return { raw: v, key: `A${sep}B${sep}Y`, kind: "ab", a: +a, b: +b, y: +y, sep };
  }
  if (Number.isNaN(Date.parse(v))) return null;
  if (/\d{1,2}:\d{2}/.test(v)) return { raw: v, key: "time", kind: "time" };
  if (MONTH_NAME.test(v) && /\b\d{4}\b/.test(v)) {
    const date = new Date(v);
    return { raw: v, key: "words", kind: "words", y: date.getFullYear(), m: date.getMonth() + 1, d: date.getDate() };
  }
  return null;
}

function isRealDate(y: number, m: number, d: number) {
  return m >= 1 && m <= 12 && d >= 1 && d <= new Date(y, m, 0).getDate();
}

const pad2 = (n: number) => String(n).padStart(2, "0");

function checkDateColumn(rows: string[][], col: number, filled: number[], add: AddIssue) {
  const reads = new Map<number, DateRead>();
  for (const i of filled) {
    const read = readDate(rows[i][col]);
    if (read) reads.set(i, read);
  }

  // Is "03/04/2024" March 4 or April 3? Look for a part over 12 anywhere in the column.
  const abReads = [...reads.values()].filter((r) => r.kind === "ab");
  const aOver12 = abReads.some((r) => r.a > 12);
  const bOver12 = abReads.some((r) => r.b > 12);
  const dayFirst = aOver12 && !bOver12;
  const ambiguous = !aOver12 && !bOver12;

  // The style most of the column uses
  const counts = new Map<string, number>();
  for (const r of reads.values()) counts.set(r.key, (counts.get(r.key) ?? 0) + 1);
  const dominantKey = [...counts.entries()].sort((x, y) => y[1] - x[1])[0]?.[0];
  const example = [...reads.values()].find((r) => r.key === dominantKey);
  const padded = [...reads.values()].some((r) => r.key === dominantKey && /^0|[-/.]0/.test(r.raw));

  function render(y: number, m: number, d: number): string | null {
    if (!example || example.kind === "words" || example.kind === "time") return null;
    if (example.kind === "ymd") return [y, pad2(m), pad2(d)].join(example.sep);
    const p = (n: number) => (padded ? pad2(n) : String(n));
    return (dayFirst ? [p(d), p(m), y] : [p(m), p(d), y]).join(example.sep);
  }

  for (const i of filled) {
    const value = rows[i][col].trim();
    const read = reads.get(i);
    if (!read) {
      add({
        row: i, col, kind: "wrong_type",
        problem: `This column is dates, but "${short(value)}" isn't a date we can read.`,
        advice: "We can't tell what date was meant, so we've only flagged it.",
        fix: null, certainty: "suggestion",
      });
      continue;
    }
    if (read.kind === "time") continue;

    let y: number, m: number, d: number;
    let swapped = false;
    if (read.kind === "ab") {
      [m, d] = dayFirst ? [read.b, read.a] : [read.a, read.b];
      y = read.y;
      // Not a real date this way round, but it is the other way: probably day/month mixed up
      if (!isRealDate(y, m, d) && isRealDate(y, d, m)) {
        [m, d] = [d, m];
        swapped = true;
      }
    } else {
      ({ y, m, d } = read);
    }

    if (!isRealDate(y, m, d)) {
      add({
        row: i, col, kind: "impossible_date",
        problem: `"${short(value)}" isn't a real date.`,
        advice: "We can't tell what date was meant, so we've only flagged it.",
        fix: null, certainty: "suggestion",
      });
      continue;
    }

    if (read.key === dominantKey && !swapped) continue;
    const fixed = render(y, m, d);
    if (!fixed || fixed === value) continue;
    add({
      row: i, col, kind: "date_format",
      problem: swapped
        ? "This date seems to have the day and month the other way round from the rest of the column."
        : `This date is written differently from most of the column (like "${example!.raw}").`,
      advice: `Change it to "${fixed}" to match.`,
      fix: { type: "set", value: fixed },
      certainty: swapped || (ambiguous && (read.kind === "ab" || example!.kind === "ab")) ? "suggestion" : "confident",
    });
  }
}

// ---------- Numbers ----------

function checkNumberColumn(rows: string[][], col: number, filled: number[], add: AddIssue) {
  const nums: { row: number; n: number }[] = [];
  for (const i of filled) {
    const value = rows[i][col].trim();
    const n = toNumber(value);
    if (n !== null) {
      nums.push({ row: i, n });
      continue;
    }
    add({
      row: i, col, kind: "wrong_type",
      problem: `This column is numbers, but this cell is text ("${short(value)}").`,
      advice: "We're not sure what number was meant, so we've only flagged it.",
      fix: null, certainty: "suggestion",
    });
  }

  // Outliers: far outside the middle half of the values (3× the interquartile range)
  if (nums.length >= 8) {
    const sorted = nums.map((x) => x.n).sort((a, b) => a - b);
    const quartile = (p: number) => sorted[Math.floor(p * (sorted.length - 1))];
    const [q1, q3] = [quartile(0.25), quartile(0.75)];
    const iqr = q3 - q1;
    if (iqr > 0) {
      for (const { row, n } of nums) {
        if (n >= q1 - 3 * iqr && n <= q3 + 3 * iqr) continue;
        add({
          row, col, kind: "outlier",
          problem: `This is much ${n > q3 ? "bigger" : "smaller"} than the rest of the column (most values are between ${formatNumber(q1)} and ${formatNumber(q3)}).`,
          advice: "It might be a typo, or it might be real, so we've only flagged it.",
          fix: null, certainty: "suggestion",
        });
      }
    }
  }

  // A few negatives in an otherwise positive column (e.g. a negative age)
  const negatives = nums.filter((x) => x.n < 0);
  if (nums.length >= 10 && negatives.length > 0 && negatives.length <= nums.length * 0.05) {
    for (const { row } of negatives) {
      add({
        row, col, kind: "outlier",
        problem: "This is negative, but almost every other value in this column is positive.",
        advice: "It might be a typo, or it might be real, so we've only flagged it.",
        fix: null, certainty: "suggestion",
      });
    }
  }
}

// ---------- Text ----------

// "new york" vs "New York": suggest the spelling most of the column uses
function checkCapitalization(rows: string[][], col: number, filled: number[], add: AddIssue) {
  const tidy = (v: string) => v.trim().replace(/\s+/g, " ");
  const groups = new Map<string, Map<string, number>>(); // lowercase → each spelling → count
  for (const i of filled) {
    const value = tidy(rows[i][col]);
    const spellings = groups.get(value.toLowerCase()) ?? new Map<string, number>();
    spellings.set(value, (spellings.get(value) ?? 0) + 1);
    groups.set(value.toLowerCase(), spellings);
  }

  const preferred = new Map<string, string>();
  for (const [lower, spellings] of groups) {
    if (spellings.size < 2) continue;
    let best = "";
    for (const [spelling, n] of spellings) if (!best || n > spellings.get(best)!) best = spelling;
    preferred.set(lower, best);
  }

  for (const i of filled) {
    const value = tidy(rows[i][col]);
    const best = preferred.get(value.toLowerCase());
    if (!best || best === value) continue;
    add({
      row: i, col, kind: "capitalization",
      problem: `Written as "${short(value)}", but the rest of the column uses "${short(best)}".`,
      advice: `Change it to "${best}" to match.`,
      fix: { type: "set", value: best },
      certainty: "confident",
    });
  }
}

// ---------- Per column ----------

function checkColumn(rows: string[][], col: number, add: AddIssue) {
  const filled: number[] = [];
  const missing: number[] = [];
  rows.forEach((row, i) => (isMissing(row[col]) ? missing : filled).push(i));
  if (filled.length === 0) return; // a completely empty column: nothing to compare against

  // Mostly-empty columns are probably optional (like "Notes"), so blanks there aren't flagged
  if (missing.length <= rows.length / 2) {
    for (const i of missing) {
      const value = rows[i][col].trim();
      add({
        row: i, col, kind: "missing",
        problem: value
          ? `This cell says "${value}", which usually means the value is missing.`
          : "This cell is empty.",
        advice: "We've flagged it but left it alone. We only fill in missing values when it clearly makes sense.",
        fix: null, certainty: "suggestion",
      });
    }
  }

  const share = (test: (v: string) => boolean) =>
    filled.filter((i) => test(rows[i][col])).length / filled.length;

  if (filled.length >= 3 && share((v) => toNumber(v) !== null) >= TYPE_THRESHOLD) {
    checkNumberColumn(rows, col, filled, add);
  } else if (filled.length >= 3 && share((v) => readDate(v) !== null) >= TYPE_THRESHOLD) {
    checkDateColumn(rows, col, filled, add);
  } else {
    checkCapitalization(rows, col, filled, add);
  }
}

// ---------- The whole dataset ----------

export function findIssues({ headers, rows }: Dataset): Issue[] {
  const issues: Issue[] = [];
  const flaggedCells = new Set<string>(); // one issue per cell: the first check to flag it wins

  const add: AddIssue = (issue) => {
    if (issue.col !== null) {
      const cell = `${issue.row}:${issue.col}`;
      if (flaggedCells.has(cell)) return;
      flaggedCells.add(cell);
    }
    issues.push({ id: `${issue.kind}:${issue.row}:${issue.col ?? "row"}`, ...issue });
  };

  headers.forEach((_, col) => checkColumn(rows, col, add));

  // Exact duplicate rows (ignoring extra spaces): flag every copy after the first
  const firstSeen = new Map<string, number>();
  rows.forEach((row, i) => {
    const key = row.map((v) => v.trim()).join("\u0000");
    const first = firstSeen.get(key);
    if (first === undefined) {
      firstSeen.set(key, i);
      return;
    }
    add({
      row: i, col: null, kind: "duplicate",
      problem: `This row is an exact copy of row ${first + 1}.`,
      advice: "Remove this copy.",
      fix: { type: "remove_row" },
      certainty: "suggestion",
    });
  });

  // Extra spaces, for cells no other check flagged (other fixes already trim)
  rows.forEach((row, i) =>
    row.forEach((value, col) => {
      if (isMissing(value) || !/^\s|\s$|\s{2,}/.test(value)) return;
      const tidy = value.trim().replace(/\s+/g, " ");
      add({
        row: i, col, kind: "spaces",
        problem: "This cell has extra spaces.",
        advice: `Remove them: "${short(tidy)}".`,
        fix: { type: "set", value: tidy },
        certainty: "confident",
      });
    })
  );

  // Top to bottom, left to right (whole-row issues first)
  return issues.sort((a, b) => a.row - b.row || (a.col ?? -1) - (b.col ?? -1));
}
