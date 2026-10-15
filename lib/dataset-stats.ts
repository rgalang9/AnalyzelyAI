import type { Dataset } from "./parse-dataset";
import type { ChartSpec, ColumnProfile, StatSpec } from "./analysis-schema";

// ---------- Small helpers ----------

// Turns text like "$1,234.50", "12%" or " 7 " into a number. Returns null if it isn't one.
export function toNumber(value: string): number | null {
  const cleaned = value.trim().replace(/^[$€£¥]/, "").replace(/,/g, "").replace(/%$/, "");
  if (!/^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(cleaned)) return null;
  return Number(cleaned);
}

export function formatNumber(n: number): string {
  return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

// Finds a column by name (exact match first, then ignoring upper/lower case)
function findColumn(headers: string[], name: string | null): number {
  if (!name) return -1;
  const exact = headers.indexOf(name);
  if (exact !== -1) return exact;
  return headers.findIndex((h) => h.toLowerCase() === name.trim().toLowerCase());
}

// Loop-based min/max (Math.min(...list) crashes on very large lists)
function minOf(nums: number[]): number {
  return nums.reduce((a, b) => (b < a ? b : a), Infinity);
}
function maxOf(nums: number[]): number {
  return nums.reduce((a, b) => (b > a ? b : a), -Infinity);
}

function numbersIn(rows: string[][], col: number): number[] {
  const nums: number[] = [];
  for (const row of rows) {
    const n = toNumber(row[col]);
    if (n !== null) nums.push(n);
  }
  return nums;
}

// Puts group names in a sensible order: numbers and dates in order,
// anything else in the order it first appears in the file.
function orderKeys(keys: string[]): string[] {
  if (keys.every((k) => toNumber(k) !== null)) {
    return [...keys].sort((a, b) => toNumber(a)! - toNumber(b)!);
  }
  if (keys.every((k) => !Number.isNaN(Date.parse(k)))) {
    return [...keys].sort((a, b) => Date.parse(a) - Date.parse(b));
  }
  return keys;
}

function isOrderedKind(keys: string[]): boolean {
  return (
    keys.every((k) => toNumber(k) !== null) ||
    keys.every((k) => !Number.isNaN(Date.parse(k)))
  );
}

// Groups rows by the x column and combines the y column per group
function groupBy(
  rows: string[][],
  xCol: number,
  yCol: number,
  aggregation: "sum" | "mean" | "count"
): Map<string, number> {
  const totals = new Map<string, { sum: number; count: number }>();
  for (const row of rows) {
    const key = row[xCol].trim() || "(blank)";
    const entry = totals.get(key) ?? { sum: 0, count: 0 };
    if (aggregation === "count") {
      entry.count++;
    } else {
      const n = toNumber(row[yCol]);
      if (n === null) continue;
      entry.sum += n;
      entry.count++;
    }
    totals.set(key, entry);
  }
  const result = new Map<string, number>();
  for (const [key, { sum, count }] of totals) {
    result.set(key, aggregation === "count" ? count : aggregation === "mean" ? sum / count : sum);
  }
  return result;
}

// Picks `count` rows spread evenly through the list
function evenlySpaced<T>(items: T[], count: number): T[] {
  if (items.length <= count) return items;
  const step = items.length / count;
  return Array.from({ length: count }, (_, i) => items[Math.floor(i * step)]);
}

// ---------- Column summary (computed from ALL rows) ----------

export function profileColumns({ headers, rows }: Dataset): ColumnProfile[] {
  return headers.map((name, col) => {
    const counts = new Map<string, number>();
    const nums: number[] = [];
    let filled = 0;

    for (const row of rows) {
      const value = row[col].trim();
      if (!value) continue;
      filled++;
      counts.set(value, (counts.get(value) ?? 0) + 1);
      const n = toNumber(value);
      if (n !== null) nums.push(n);
    }

    const kind = filled === 0 ? "empty" : nums.length >= filled * 0.9 ? "numeric" : "text";
    const sum = nums.reduce((a, b) => a + b, 0);

    return {
      name,
      kind,
      filled,
      empty: rows.length - filled,
      distinct: counts.size,
      min: kind === "numeric" ? minOf(nums) : null,
      max: kind === "numeric" ? maxOf(nums) : null,
      mean: kind === "numeric" ? sum / nums.length : null,
      sum: kind === "numeric" ? sum : null,
      topValues:
        kind === "text"
          ? [...counts.entries()]
              .sort((a, b) => b[1] - a[1])
              .slice(0, 5)
              .map(([value, count]) => ({ value: value.slice(0, 80), count }))
          : [],
    };
  });
}

// ---------- Which rows to send to the AI ----------

const CHAR_BUDGET = 60_000; // roughly 15-20k tokens of data per question
const MAX_SAMPLE_ROWS = 200;
const MAX_CELL_CHARS = 200;

export function rowsForPrompt({ rows }: Dataset): { rows: string[][]; isSample: boolean } {
  const trimmed = (row: string[]) => row.map((cell) => cell.slice(0, MAX_CELL_CHARS));

  let totalChars = 0;
  for (const row of rows) {
    for (const cell of row) totalChars += Math.min(cell.length, MAX_CELL_CHARS) + 1;
    if (totalChars > CHAR_BUDGET) break;
  }

  // Small enough: send everything
  if (totalChars <= CHAR_BUDGET) return { rows: rows.map(trimmed), isSample: false };

  // Too big: send an evenly spaced sample that fits the budget
  const avgRowChars = Math.max(1, totalChars / rows.length);
  const sampleSize = Math.max(20, Math.min(MAX_SAMPLE_ROWS, Math.floor(CHAR_BUDGET / avgRowChars)));
  return { rows: evenlySpaced(rows, sampleSize).map(trimmed), isSample: true };
}

// ---------- Turn the AI's stat requests into real numbers ----------

export type StatResult = { label: string; value: string; detail?: string };

export function computeStat({ headers, rows }: Dataset, spec: StatSpec): StatResult | null {
  const col = findColumn(headers, spec.column);
  if (col === -1) return null; // the AI named a column that doesn't exist
  const label = spec.label;

  if (spec.type === "count") {
    const filled = rows.filter((row) => row[col].trim()).length;
    return { label, value: formatNumber(filled) };
  }
  if (spec.type === "distinct_count") {
    const distinct = new Set(rows.map((row) => row[col].trim()).filter(Boolean));
    return { label, value: formatNumber(distinct.size) };
  }

  if (spec.type === "correlation") {
    const col2 = findColumn(headers, spec.column2);
    if (col2 === -1) return null;
    const xs: number[] = [];
    const ys: number[] = [];
    for (const row of rows) {
      const x = toNumber(row[col]);
      const y = toNumber(row[col2]);
      if (x !== null && y !== null) {
        xs.push(x);
        ys.push(y);
      }
    }
    if (xs.length < 3) return null;
    const meanX = xs.reduce((a, b) => a + b, 0) / xs.length;
    const meanY = ys.reduce((a, b) => a + b, 0) / ys.length;
    let cov = 0, varX = 0, varY = 0;
    for (let i = 0; i < xs.length; i++) {
      cov += (xs[i] - meanX) * (ys[i] - meanY);
      varX += (xs[i] - meanX) ** 2;
      varY += (ys[i] - meanY) ** 2;
    }
    if (varX === 0 || varY === 0) return null;
    const r = cov / Math.sqrt(varX * varY);
    return {
      label,
      value: `r = ${r.toFixed(2)}`,
      detail: `R² = ${(r * r).toFixed(2)} · based on ${formatNumber(xs.length)} rows`,
    };
  }

  if (spec.type === "growth_rate") {
    let first: number, last: number, firstName: string, lastName: string;
    const periodCol = findColumn(headers, spec.column2);

    if (periodCol !== -1) {
      // Total the value per period, then compare the first and last period
      const totals = groupBy(rows, periodCol, col, "sum");
      const keys = orderKeys([...totals.keys()].filter((k) => k !== "(blank)"));
      if (keys.length < 2) return null;
      [firstName, lastName] = [keys[0], keys[keys.length - 1]];
      [first, last] = [totals.get(firstName)!, totals.get(lastName)!];
    } else {
      // No period column: compare the first and last value in file order
      const nums = numbersIn(rows, col);
      if (nums.length < 2) return null;
      [first, last] = [nums[0], nums[nums.length - 1]];
      [firstName, lastName] = ["first row", "last row"];
    }

    if (first === 0) return null; // can't compute a % change from zero
    const pct = ((last - first) / Math.abs(first)) * 100;
    return {
      label,
      value: `${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%`,
      detail: `${formatNumber(first)} (${firstName}) → ${formatNumber(last)} (${lastName})`,
    };
  }

  // mean / median / sum / min / max
  const nums = numbersIn(rows, col);
  if (nums.length === 0) return null;
  let value: number;
  if (spec.type === "sum") value = nums.reduce((a, b) => a + b, 0);
  else if (spec.type === "mean") value = nums.reduce((a, b) => a + b, 0) / nums.length;
  else if (spec.type === "min") value = minOf(nums);
  else if (spec.type === "max") value = maxOf(nums);
  else {
    const sorted = [...nums].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    value = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  }
  return { label, value: formatNumber(value), detail: `based on ${formatNumber(nums.length)} rows` };
}

// ---------- Turn the AI's chart requests into chart points ----------

export type ChartData = {
  title: string;
  type: ChartSpec["type"];
  points: { x: string | number; y: number }[];
  xLabel: string;
  yLabel: string;
  note?: string;
};

const MAX_BARS = 20;
const MAX_LINE_POINTS = 500;
const MAX_SCATTER_POINTS = 1000;

export function buildChartData({ headers, rows }: Dataset, spec: ChartSpec): ChartData | null {
  const xCol = findColumn(headers, spec.x_column);
  if (xCol === -1) return null;
  const yCol = findColumn(headers, spec.y_column);
  const base = { title: spec.title, type: spec.type, xLabel: headers[xCol] };

  if (spec.type === "scatter") {
    if (yCol === -1) return null;
    const points: { x: number; y: number }[] = [];
    for (const row of rows) {
      const x = toNumber(row[xCol]);
      const y = toNumber(row[yCol]);
      if (x !== null && y !== null) points.push({ x, y });
    }
    if (points.length < 2) return null;
    return {
      ...base,
      yLabel: headers[yCol],
      points: evenlySpaced(points, MAX_SCATTER_POINTS),
      note:
        points.length > MAX_SCATTER_POINTS
          ? `Showing ${formatNumber(MAX_SCATTER_POINTS)} of ${formatNumber(points.length)} points`
          : undefined,
    };
  }

  // Bar and line: group by x, combine y. No y column means "count rows".
  const aggregation =
    yCol === -1 || spec.aggregation === "count"
      ? "count"
      : spec.aggregation === "mean"
        ? "mean"
        : "sum";
  const groups = groupBy(rows, xCol, yCol, aggregation);
  if (groups.size === 0) return null;

  const yLabel =
    aggregation === "count"
      ? "Number of rows"
      : `${aggregation === "mean" ? "Average" : "Total"} ${headers[yCol]}`;

  let keys = [...groups.keys()];
  let note: string | undefined;

  if (spec.type === "line" || isOrderedKind(keys)) {
    keys = orderKeys(keys);
    const limit = spec.type === "line" ? MAX_LINE_POINTS : MAX_BARS * 2;
    if (keys.length > limit) {
      note = `Showing ${limit} of ${formatNumber(keys.length)} values, evenly spaced`;
      keys = evenlySpaced(keys, limit);
    }
  } else {
    // Categories: biggest first, top 20
    keys.sort((a, b) => groups.get(b)! - groups.get(a)!);
    if (keys.length > MAX_BARS) {
      note = `Showing the top ${MAX_BARS} of ${formatNumber(keys.length)} categories`;
      keys = keys.slice(0, MAX_BARS);
    }
  }

  return { ...base, yLabel, note, points: keys.map((k) => ({ x: k, y: groups.get(k)! })) };
}
