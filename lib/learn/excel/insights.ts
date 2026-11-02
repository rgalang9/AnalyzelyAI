// The Insights panel's sums: a simple pivot table and the numbers behind a chart, worked out from
// a block of cells (header row = field names). Used by the panel, by grading and by Show answer.

import type { ExcelValue } from "../lesson-types";

export const AGGS = ["sum", "count", "average", "max", "min"] as const;
export type Agg = (typeof AGGS)[number];
export const CHART_TYPES = ["column", "bar", "line", "pie", "scatter", "combo"] as const;
export type ChartType = (typeof CHART_TYPES)[number];

export type PivotSettings = {
  rows: string | null;
  columns: string | null;
  values: string | null;
  agg: Agg;
  percentOfTotal: boolean;
  groupByMonth: boolean;
  slicers: Record<string, string[]>; // field → the values ticked (shown)
};
export type ChartSettings = { type: ChartType; x: string | null; y: string | null; agg: Agg; line: string | null; title: string };

// What the panel is working on: the cells it reads, and its settings
export type InsightsState = { source: { sheet: string; range: string } | null; pivot: PivotSettings; chart: ChartSettings };

export const NEW_PIVOT: PivotSettings = { rows: null, columns: null, values: null, agg: "sum", percentOfTotal: false, groupByMonth: false, slicers: {} };
export const NEW_CHART: ChartSettings = { type: "column", x: null, y: null, agg: "sum", line: null, title: "" };

export type Field = { name: string; kind: "number" | "date" | "text" };
export type DataTable = { fields: Field[]; rows: ExcelValue[][] };

const isEmpty = (v: ExcelValue) => v === null || v === "";
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
// A number format that shows a date (it has days or years, or months without digits around them)
const isDateFormat = (f: string) => /[dy]/i.test(f.replace(/"[^"]*"/g, "")) && !/^general$/i.test(f);

// The block of cells as fields and rows. `formats`: each column's number format (from its first data cell).
export function toTable(values: ExcelValue[][], formats: string[]): DataTable {
  const [header = [], ...rows] = values;
  const fields = header.map((h, c): Field => {
    const name = isEmpty(h) ? `Column ${c + 1}` : String(h).trim();
    const filled = rows.map((r) => r[c]).filter((v) => !isEmpty(v));
    const numbers = filled.length > 0 && filled.every((v) => typeof v === "number");
    if (numbers && isDateFormat(formats[c] ?? "")) return { name, kind: "date" };
    if (filled.length > 0 && filled.every((v) => typeof v === "string" && ISO_DATE.test(v.trim()))) return { name, kind: "date" };
    return { name, kind: numbers ? "number" : "text" };
  });
  return { fields, rows: rows.filter((r) => r.some((v) => !isEmpty(v))) };
}

export const fieldIndex = (table: DataTable, name: string | null) =>
  name === null ? -1 : table.fields.findIndex((f) => f.name.toLowerCase() === name.toLowerCase());

// Excel keeps dates as day numbers (1 = 1 Jan 1900)
function isoDate(v: ExcelValue): string {
  if (typeof v === "number") return new Date(Math.round((v - 25569) * 86400000)).toISOString().slice(0, 10);
  return String(v).trim().slice(0, 10);
}

const BLANK = "(blank)";
// How a value is grouped: dates by day (or month), everything else as its text
export function keyOf(v: ExcelValue, field: Field, byMonth: boolean): string {
  if (isEmpty(v)) return BLANK;
  if (field.kind === "date") return byMonth ? isoDate(v).slice(0, 7) : isoDate(v);
  return String(v).trim();
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const monthOf = (s: string) => MONTHS.indexOf(s.toLowerCase().slice(0, 3));
const isMonthName = (s: string) =>
  monthOf(s) >= 0 && /^(jan(uary)?|feb(ruary)?|mar(ch)?|apr(il)?|may|june?|july?|aug(ust)?|sep(t(ember)?)?|oct(ober)?|nov(ember)?|dec(ember)?)$/i.test(s);
const collator = new Intl.Collator(undefined, { sensitivity: "base", numeric: true });

// "2026-01" (a month) as "Jan 2026"; everything else as it is
export function labelOf(key: string, field: Field | undefined): string {
  if (field?.kind === "date" && /^\d{4}-\d{2}$/.test(key)) return `${MONTHS[Number(key.slice(5)) - 1].replace(/^./, (c) => c.toUpperCase())} ${key.slice(0, 4)}`;
  return key;
}

// Group keys in order: dates and numbers ascending, month names Jan→Dec, other text A→Z (or, for
// `keepOrder`, as they first appear, like a chart of the rows), blanks last
function sortKeys(keys: string[], field: Field, keepOrder: boolean): string[] {
  const real = keys.filter((k) => k !== BLANK);
  let sorted: string[];
  if (field.kind === "date") sorted = [...real].sort();
  else if (field.kind === "number") sorted = [...real].sort((a, b) => Number(a) - Number(b));
  else if (real.length > 0 && real.every(isMonthName)) sorted = [...real].sort((a, b) => monthOf(a) - monthOf(b));
  else sorted = keepOrder ? real : [...real].sort(collator.compare);
  return keys.includes(BLANK) ? [...sorted, BLANK] : sorted;
}

// One summary of a list of values. Count counts filled cells; the others use the numbers.
export function summarize(values: ExcelValue[], agg: Agg): number | null {
  if (agg === "count") return values.filter((v) => !isEmpty(v)).length;
  const nums = values.filter((v): v is number => typeof v === "number");
  if (nums.length === 0) return agg === "sum" ? 0 : null;
  if (agg === "sum") return nums.reduce((a, b) => a + b, 0);
  if (agg === "average") return nums.reduce((a, b) => a + b, 0) / nums.length;
  return agg === "max" ? Math.max(...nums) : Math.min(...nums);
}

// The distinct values of a field, for slicer tick boxes
export function distinctValues(table: DataTable, name: string): string[] {
  const i = fieldIndex(table, name);
  if (i < 0) return [];
  return sortKeys([...new Set(table.rows.map((r) => keyOf(r[i], table.fields[i], false)))], table.fields[i], false);
}

// Slicers that actually filter something (all values ticked = no filter), with the table's own spelling
export function activeSlicers(table: DataTable, slicers: Record<string, string[]>): Record<string, string[]> {
  const active: Record<string, string[]> = {};
  for (const [name, ticked] of Object.entries(slicers)) {
    const all = distinctValues(table, name);
    const on = new Set(ticked.map((t) => t.toLowerCase()));
    const shown = all.filter((v) => on.has(v.toLowerCase()));
    if (all.length > 0 && shown.length < all.length) active[name] = shown;
  }
  return active;
}

export type PivotResult = {
  rowField: Field | null;
  colField: Field | null;
  rowKeys: string[];
  colKeys: string[]; // [] when there's no Columns field
  cell: (row: string, col: string | null) => number | null; // col null: the row's total
  colTotal: (col: string) => number | null;
  grand: number | null;
};

export function computePivot(table: DataTable, s: PivotSettings): PivotResult {
  const ri = fieldIndex(table, s.rows);
  const ci = fieldIndex(table, s.columns);
  const vi = fieldIndex(table, s.values);
  const rowField = ri >= 0 ? table.fields[ri] : null;
  const colField = ci >= 0 ? table.fields[ci] : null;
  const filters = Object.entries(activeSlicers(table, s.slicers)).map(([name, shown]) => {
    const i = fieldIndex(table, name);
    const ok = new Set(shown.map((v) => v.toLowerCase()));
    return (row: ExcelValue[]) => ok.has(keyOf(row[i], table.fields[i], false).toLowerCase());
  });
  const rows = table.rows.filter((r) => filters.every((f) => f(r)));
  const rk = (r: ExcelValue[]) => (rowField ? keyOf(r[ri], rowField, s.groupByMonth) : "");
  const ck = (r: ExcelValue[]) => (colField ? keyOf(r[ci], colField, s.groupByMonth) : "");
  // Count with no Values field counts rows
  const valueOf = (r: ExcelValue[]) => (vi >= 0 ? r[vi] : s.agg === "count" ? 1 : null);
  const groups = new Map<string, ExcelValue[]>();
  const add = (key: string, v: ExcelValue) => (groups.get(key) ?? groups.set(key, []).get(key)!).push(v);
  for (const r of rows) {
    const v = valueOf(r);
    add(`${rk(r)}\u0000${ck(r)}`, v);
    add(`${rk(r)}\u0000*`, v);
    add(`*\u0000${ck(r)}`, v);
    add("*\u0000*", v);
  }
  const raw = (row: string, col: string) => {
    const list = groups.get(`${row}\u0000${col}`);
    return list ? summarize(list, s.agg) : null;
  };
  const grandRaw = raw("*", "*");
  const pct = (n: number | null) => (n === null || !s.percentOfTotal ? n : grandRaw ? n / grandRaw : null);
  return {
    rowField,
    colField,
    rowKeys: rowField ? sortKeys([...new Set(rows.map(rk))], rowField, false) : [],
    colKeys: colField ? sortKeys([...new Set(rows.map(ck))], colField, false) : [],
    cell: (row, col) => pct(raw(row, col ?? "*")),
    colTotal: (col) => pct(raw("*", col)),
    grand: rows.length === 0 ? null : pct(grandRaw),
  };
}

// The numbers behind a chart: one group per X value (as the rows first show them, dates in order),
// or for scatter, one point per row
export type ChartData =
  | { kind: "groups"; labels: string[]; y: (number | null)[]; line: (number | null)[] | null }
  | { kind: "points"; points: { x: number; y: number }[] };

export function chartData(table: DataTable, s: ChartSettings): ChartData | null {
  const xi = fieldIndex(table, s.x);
  const yi = fieldIndex(table, s.y);
  if (xi < 0 || (yi < 0 && s.agg !== "count")) return null;
  if (s.type === "scatter") {
    const points = table.rows
      .filter((r) => typeof r[xi] === "number" && typeof r[yi] === "number")
      .map((r) => ({ x: r[xi] as number, y: r[yi] as number }));
    return { kind: "points", points };
  }
  const xField = table.fields[xi];
  const li = s.type === "combo" ? fieldIndex(table, s.line) : -1;
  const keys = sortKeys([...new Set(table.rows.map((r) => keyOf(r[xi], xField, false)))], xField, true);
  const of = (i: number) =>
    keys.map((k) => summarize(table.rows.filter((r) => keyOf(r[xi], xField, false) === k).map((r) => (i >= 0 ? r[i] : 1)), s.agg));
  return { kind: "groups", labels: keys.map((k) => labelOf(k, xField)), y: of(yi), line: li >= 0 ? of(li) : null };
}

// ---------- Checking the panel against a task ----------

// A task's "pivot" and "chart" checks, as written in the lesson file (only the keys given are checked)
export type PivotCheck = Partial<{
  rows: string | null;
  columns: string | null;
  values: string | null;
  agg: Agg;
  percent_of_total: boolean;
  group_by_month: boolean;
  slicers: Record<string, string[]>;
}>;
export type ChartCheck = Partial<{ type: ChartType; x: string | null; y: string | null; agg: Agg; line: string | null; title: string }>;

const sameName = (a: string | null | undefined, b: string | null | undefined) => (a ?? "").toLowerCase() === (b ?? "").toLowerCase();
const sameSet = (a: string[], b: string[]) => {
  const norm = (l: string[]) => [...new Set(l.map((x) => x.trim().toLowerCase()))].sort().join("\n");
  return norm(a) === norm(b);
};

// The fields a task's pivot and chart checks name, and the first of them a table doesn't have
export function taskFields(pivot: PivotCheck | undefined, chart: ChartCheck | undefined): string[] {
  const names = [pivot?.rows, pivot?.columns, pivot?.values, ...Object.keys(pivot?.slicers ?? {}), chart?.x, chart?.y, chart?.line];
  return names.filter((n): n is string => typeof n === "string");
}
export const missingField = (table: DataTable | null, names: string[]) => names.find((n) => !table || fieldIndex(table, n) < 0);

// The first setting that doesn't match, in words, or null when all the given ones do
export function pivotMismatch(want: PivotCheck, have: PivotSettings, table: DataTable): string | null {
  if (want.rows !== undefined && !sameName(want.rows, have.rows)) return "Rows";
  if (want.columns !== undefined && !sameName(want.columns, have.columns)) return "Columns";
  if (want.values !== undefined && !sameName(want.values, have.values)) return "Values";
  if (want.agg !== undefined && want.agg !== have.agg) return "Summarize by";
  if (want.percent_of_total !== undefined && want.percent_of_total !== have.percentOfTotal) return "Show as % of total";
  if (want.group_by_month !== undefined && want.group_by_month !== have.groupByMonth) return "Group dates by month";
  if (want.slicers !== undefined) {
    const active = activeSlicers(table, have.slicers);
    const fields = new Set([...Object.keys(want.slicers), ...Object.keys(active)].map((f) => f.toLowerCase()));
    for (const f of fields) {
      const w = Object.entries(want.slicers).find(([k]) => k.toLowerCase() === f)?.[1];
      const h = Object.entries(active).find(([k]) => k.toLowerCase() === f)?.[1];
      if (!w || !h || !sameSet(w, h)) return "Slicers";
    }
  }
  return null;
}

export function chartMismatch(want: ChartCheck, have: ChartSettings): string | null {
  if (want.type !== undefined && want.type !== have.type) return "Chart type";
  if (want.x !== undefined && !sameName(want.x, have.x)) return "X field";
  if (want.y !== undefined && !sameName(want.y, have.y)) return have.type === "combo" ? "Bar field" : "Y field";
  if (want.line !== undefined && !sameName(want.line, have.line)) return "Line field";
  if (want.agg !== undefined && want.agg !== have.agg) return "Summarize by";
  if (want.title !== undefined && want.title !== have.title) return "Title";
  return null;
}

// Settings made to match a task's check (for Show answer): the given keys win, the rest stay
export function pivotFor(want: PivotCheck, base: PivotSettings): PivotSettings {
  return {
    rows: want.rows !== undefined ? want.rows : base.rows,
    columns: want.columns !== undefined ? want.columns : base.columns,
    values: want.values !== undefined ? want.values : base.values,
    agg: want.agg ?? base.agg,
    percentOfTotal: want.percent_of_total ?? base.percentOfTotal,
    groupByMonth: want.group_by_month ?? base.groupByMonth,
    slicers: want.slicers ?? base.slicers,
  };
}

export function chartFor(want: ChartCheck, base: ChartSettings): ChartSettings {
  return {
    type: want.type ?? base.type,
    x: want.x !== undefined ? want.x : base.x,
    y: want.y !== undefined ? want.y : base.y,
    agg: want.agg ?? base.agg,
    line: want.line !== undefined ? want.line : base.line,
    title: want.title ?? base.title,
  };
}
