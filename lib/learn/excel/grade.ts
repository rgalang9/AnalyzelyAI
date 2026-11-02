// Grading one Excel task: is the sheet right yet? Used by the lesson page and by the tester
// (npm run test:excel), so both follow exactly the same rules.

import type { ConditionalFormat, ExcelTask, ExcelValue, Validation } from "../lesson-types";
import { cellsIn, sameRange } from "./cells";
import { SHORTCUTS } from "./shortcuts";
import { chartMismatch, pivotMismatch, type DataTable, type InsightsState } from "./insights";

export type Reading = { value: ExcelValue; formula: string; numberFormat: string; fontColor: string | null };
export type Selection = { sheet: string; range: string } | null;
// A conditional formatting rule on the sheet, in the lesson file's words (type null: a kind lessons don't check)
export type SheetRule = { ranges: string[]; type: ConditionalFormat["type"] | null; value?: unknown; fill: string | null };
// A data validation rule on the sheet, in the lesson file's words (type null: a kind lessons don't check)
export type SheetValidation = { ranges: string[]; type: Validation["type"] | null; values?: string[]; min?: number; max?: number };
// How the sheet is laid out: hidden rows (numbers as on screen, by a filter or hidden), hidden columns,
// frozen panes and data validation rules
export type SheetLayout = {
  hiddenRows: number[];
  hiddenColumns: string[];
  frozen: { rows: number; columns: number };
  validations: SheetValidation[];
  tables: { range: string; name: string }[];
};

// pass: done. wait: not finished yet (with an optional friendly note). wrong: a real miss.
export type Grade = { status: "pass" } | { status: "wait"; note?: string } | { status: "wrong"; message: string };

const isBlank = (v: ExcelValue) => v === null || v === "";

// Excel's error results, e.g. #NAME? when a function name is misspelled (#CYCLE! is Univer's circular reference)
export const EXCEL_ERRORS = ["#N/A", "#DIV/0!", "#NAME?", "#VALUE!", "#REF!", "#NUM!", "#NULL!", "#SPILL!", "#CALC!", "#CYCLE!"];
const isError = (v: ExcelValue) => typeof v === "string" && EXCEL_ERRORS.includes(v.trim().toUpperCase());
const squash = (s: string) => s.trim().replace(/\s+/g, " ").toLowerCase();

// Fair matching: numbers within 0.01; text ignores capitals and extra spaces (unless `exact`);
// an expected value starting with # is an error code, and the cell must show that error
export function matches(value: ExcelValue, expected: ExcelValue, exact = false): boolean {
  if (expected === null) return isBlank(value);
  if (isBlank(value)) return false;
  if (typeof expected === "string" && expected.trim().startsWith("#"))
    return typeof value === "string" && value.trim().toUpperCase() === expected.trim().toUpperCase();
  if (typeof expected === "number") {
    const n = typeof value === "number" ? value : Number(String(value).trim());
    return Number.isFinite(n) && Math.abs(n - expected) <= 0.01 + 1e-9;
  }
  if (exact && typeof expected === "string") return String(value) === expected;
  return squash(String(value)) === squash(String(expected));
}

// Number formats that look the same count as the same: only the positive-number part is compared,
// and quotes, colours like [Red], padding like _) and spaces are ignored.
// So Univer's currency button ("$"#,##0.00_);[Red]("$"#,##0.00) matches $#,##0.00.
export function sameFormat(a: string, b: string): boolean {
  return normalFormat(a) === normalFormat(b);
}

function normalFormat(pattern: string): string {
  const p = (pattern ?? "").trim();
  if (p === "" || p.toLowerCase() === "general") return "general";
  let out = "";
  for (let i = 0; i < p.length; i++) {
    const ch = p[i];
    if (ch === ";") break; // the part for negative numbers, zero or text
    if (ch === '"') {
      const end = p.indexOf('"', i + 1);
      out += p.slice(i + 1, end < 0 ? p.length : end);
      i = end < 0 ? p.length : end;
    } else if (ch === "\\") out += p[++i] ?? "";
    else if (ch === "_" || ch === "*") i++; // padding and repeat-fill take the next character
    else if (ch === "[") {
      const end = p.indexOf("]", i);
      const inside = p.slice(i + 1, end < 0 ? p.length : end);
      if (inside.startsWith("$")) out += inside.slice(1).split("-")[0]; // [$€-407] is just €
      i = end < 0 ? p.length : end;
    } else if (!/\s/.test(ch)) out += ch;
  }
  return out.toLowerCase();
}

// Blue is clearly the strongest: #0000FF, #0070C0 and #4472C4 are blue; cyan and purple aren't
export function isBlue(colour: string | null | undefined): boolean {
  const hex = normalColour(colour);
  if (!hex) return false;
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return b >= 80 && b > 1.3 * r && b > 1.3 * g && r <= g + 40;
}

// "#FC9", "#FFCC99" and "rgb(255, 204, 153)" are all "#ffcc99"
export function normalColour(colour: string | null | undefined): string | null {
  const c = (colour ?? "").trim().toLowerCase();
  let m = c.match(/^#([0-9a-f])([0-9a-f])([0-9a-f])$/);
  if (m) return `#${m[1]}${m[1]}${m[2]}${m[2]}${m[3]}${m[3]}`;
  if (/^#[0-9a-f]{6}$/.test(c)) return c;
  m = c.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
  if (m) return `#${m.slice(1, 4).map((n) => Number(n).toString(16).padStart(2, "0")).join("")}`;
  return null;
}

const CF_WORDS: Record<ConditionalFormat["type"], string> = {
  greater_than: "Greater Than",
  less_than: "Less Than",
  between: "Between",
  equal_to: "Equal To",
  text_contains: "Text that Contains",
  duplicate: "Duplicate Values",
};

function sameCfValue(got: unknown, want: ConditionalFormat["value"]): boolean {
  if (want === undefined) return true;
  if (Array.isArray(want)) {
    if (!Array.isArray(got) || got.length !== 2) return false;
    const [a, b] = [...got].map(Number).sort((x, y) => x - y);
    const [c, d] = [...want].sort((x, y) => x - y);
    return Math.abs(a - c) < 1e-9 && Math.abs(b - d) < 1e-9;
  }
  if (typeof want === "number") return Number(got) === want;
  return squash(String(got ?? "")) === squash(want);
}

// Is a rule like the task's on the sheet? pass, wait (no rule on that range yet) or wrong, with why
function gradeConditionalFormat(want: ConditionalFormat, rules: SheetRule[]): Grade {
  const onRange = rules.filter((r) => r.ranges.length === 1 && sameRange(r.ranges[0], want.range));
  const fillOk = (r: SheetRule) => !want.fill || normalColour(r.fill) === normalColour(want.fill);
  if (onRange.some((r) => r.type === want.type && sameCfValue(r.value, want.value) && fillOk(r))) return { status: "pass" };
  if (onRange.length === 0) {
    if (rules.length === 0) return { status: "wait" };
    return { status: "wrong", message: `Close! The rule needs to cover exactly ${want.range}.` };
  }
  const sameType = onRange.filter((r) => r.type === want.type);
  if (sameType.length === 0) return { status: "wrong", message: `Not quite: this task wants a "${CF_WORDS[want.type]}" rule on ${want.range}.` };
  if (!sameType.some((r) => sameCfValue(r.value, want.value))) return { status: "wrong", message: "Right kind of rule! Check the value in it." };
  return { status: "wrong", message: "Right rule! Now check the fill colour." };
}

// Exactly these rows (or columns) hidden? Fewer is "not done yet" (a filter at a time); any other one is a miss
function gradeHidden(kind: "Row" | "Column", want: (number | string)[], got: (number | string)[]): Grade {
  const extra = got.filter((x) => !want.includes(x));
  if (extra.length > 0)
    return { status: "wrong", message: `Not quite: ${kind.toLowerCase()} ${extra[0]} is hidden, but it should show.` };
  return got.length === want.length ? { status: "pass" } : { status: "wait" };
}

function gradeFrozen(want: { rows: number; columns: number }, got: { rows: number; columns: number }): Grade {
  if (got.rows === want.rows && got.columns === want.columns) return { status: "pass" };
  if (got.rows <= want.rows && got.columns <= want.columns) return { status: "wait" };
  const s = (n: number) => (n === 1 ? "" : "s");
  return { status: "wrong", message: `Not quite: freeze ${want.rows} row${s(want.rows)} and ${want.columns} column${s(want.columns)}.` };
}

const sameList = (a: string[], b: string[]) => {
  const norm = (l: string[]) => [...new Set(l.map(squash))].sort().join("\n");
  return norm(a) === norm(b);
};

function gradeValidation(want: Validation, got: SheetValidation[]): Grade {
  const onRange = got.filter((v) => v.ranges.length === 1 && sameRange(v.ranges[0], want.range));
  const valuesOk = (v: SheetValidation) =>
    want.type === "list" ? sameList(v.values ?? [], want.values) : v.min === want.min && v.max === want.max;
  if (onRange.some((v) => v.type === want.type && valuesOk(v))) return { status: "pass" };
  if (onRange.length === 0) {
    if (got.length === 0) return { status: "wait" };
    return { status: "wrong", message: `Close! The rule needs to cover exactly ${want.range}.` };
  }
  if (!onRange.some((v) => v.type === want.type))
    return { status: "wrong", message: `Not quite: this task wants ${want.type === "list" ? "a dropdown list" : "a whole number (integer) rule"} on ${want.range}.` };
  if (want.type === "list") return { status: "wrong", message: `Right kind of rule! Check the choices: ${want.values.join(", ")}.` };
  const limits = [want.min !== undefined && `at least ${want.min}`, want.max !== undefined && `at most ${want.max}`].filter(Boolean).join(" and ");
  return { status: "wrong", message: `Right kind of rule! Check the numbers: whole numbers ${limits}.` };
}

function gradeTable(want: NonNullable<ExcelTask["table"]>, tables: SheetLayout["tables"]): Grade {
  const onRange = tables.find((t) => sameRange(t.range, want.range));
  if (!onRange) {
    if (tables.length === 0) return { status: "wait" };
    return { status: "wrong", message: `Close! The table needs to cover exactly ${want.range}, headers included.` };
  }
  if (want.name && onRange.name.toLowerCase() !== want.name.toLowerCase())
    return { status: "wrong", message: `The table is called ${onRange.name}. Rename it to ${want.name}.` };
  return { status: "pass" };
}

// The Insights panel as the learner has set it, and the cells it reads (null: no data picked yet)
export type InsightsReading = { state: InsightsState; table: DataTable | null };

// Panel settings are changed one dropdown at a time, so a mismatch is "not done yet", never a miss
function gradeInsights(task: ExcelTask, insights: InsightsReading | undefined): Grade[] {
  if (!task.pivot && !task.chart) return [];
  const table = insights?.state.source ? insights.table : null;
  if (!insights || !table) return [{ status: "wait" }];
  const pivotOff = task.pivot ? pivotMismatch(task.pivot, insights.state.pivot, table) : null;
  const chartOff = task.chart ? chartMismatch(task.chart, insights.state.chart) : null;
  return [pivotOff || chartOff ? { status: "wait" } : { status: "pass" }];
}

// The task's checks on the sheet itself (not its cells): the first miss, else the first not-done-yet, else pass
function gradeSheet(task: ExcelTask, rules: SheetRule[], layout: SheetLayout | undefined, insights?: InsightsReading): Grade | null {
  const grades: Grade[] = [];
  if (task.conditional_format) grades.push(gradeConditionalFormat(task.conditional_format, rules));
  if (layout && task.hidden_rows) grades.push(gradeHidden("Row", task.hidden_rows, layout.hiddenRows));
  if (layout && task.hidden_columns) grades.push(gradeHidden("Column", task.hidden_columns, layout.hiddenColumns));
  if (layout && task.frozen) grades.push(gradeFrozen(task.frozen, layout.frozen));
  if (layout && task.validation) grades.push(gradeValidation(task.validation, layout.validations));
  if (layout && task.table) grades.push(gradeTable(task.table, layout.tables));
  grades.push(...gradeInsights(task, insights));
  if (grades.length === 0) return null;
  return grades.find((g) => g.status === "wrong") ?? grades.find((g) => g.status === "wait") ?? { status: "pass" };
}

export function gradeTask({
  task,
  readings,
  rules = [],
  layout,
  insights,
  selection,
  firstSheet,
  pressed,
}: {
  task: ExcelTask;
  readings: Reading[]; // one per cell of task.cell, row by row
  rules?: SheetRule[]; // conditional formatting on the task's sheet
  layout?: SheetLayout; // needed when the task checks hidden rows or columns, frozen panes or validation
  insights?: InsightsReading; // needed when the task checks the pivot table or chart
  selection: Selection;
  firstSheet: string; // the sheet used when the task doesn't name one
  pressed: boolean; // the task's shortcut was pressed during this task
}): Grade {
  const sheet = task.sheet ?? firstSheet;
  const selectedOk = !task.selected || (!!selection && selection.sheet === sheet && sameRange(selection.range, task.selected));
  // A task that must be done with the keys: until they're pressed, mistakes along the way aren't misses
  const needKeys = !!task.shortcut && task.shortcut_required && !pressed;
  const keysNote = task.shortcut ? `This time, use the keys (${SHORTCUTS[task.shortcut].action.toLowerCase()}).` : "";
  const onSheet = gradeSheet(task, rules, layout, insights);

  // No cell to check: a selection or sheet task (a keys-only task is passed by the key press itself)
  if (!task.cell) {
    if (onSheet && onSheet.status !== "pass") return onSheet;
    if (task.selected && !selectedOk) return { status: "wait" };
    if (!task.selected && !onSheet) return { status: "wait" };
    if (needKeys)
      return { status: "wait", note: task.selected ? `That's the right selection! ${keysNote} Click one cell and try again.` : `Right! ${keysNote}` };
    return { status: "pass" };
  }

  const cells = cellsIn(task.cell);
  if (task.expected !== undefined) {
    const expected = Array.isArray(task.expected) ? task.expected : [task.expected];
    let waiting = false; // some cells are still empty
    for (let i = 0; i < cells.length; i++) {
      const { value } = readings[i];
      if (isBlank(value)) {
        if (expected[i] !== null) waiting = true;
        continue;
      }
      if (matches(value, expected[i], task.exact_text)) continue;
      if (needKeys) return { status: "wait" };
      if (matches(value, expected[i]))
        return { status: "wrong", message: `So close! ${cells[i]} needs to match exactly, capitals and spaces included.` };
      if (isError(value)) {
        const why = isError(expected[i])
          ? `but this task expects ${expected[i]}`
          : value === "#SPILL!"
            ? "because something is in the way. The results need empty cells to spill into"
            : "check the spelling";
        return { status: "wrong", message: `Excel shows ${value} in ${cells[i]}, ${why}.` };
      }
      return { status: "wrong", message: "Not quite, try a hint." };
    }
    if (waiting) return { status: "wait" };
  }

  // The value is right. Any formula giving it passes, unless the task asks for a function or bits.
  // A spill task's formula is only in its top-left cell.
  const functions = task.function === undefined ? [] : [task.function].flat();
  for (let i = 0; i < (task.spill ? 1 : cells.length); i++) {
    const formula = readings[i].formula.toUpperCase();
    if ((task.must_be_formula || functions.length > 0 || task.formula_contains.length > 0) && !formula.startsWith("="))
      return { status: "wrong", message: "Right number, but type a formula starting with =." };
    if (task.must_be_value && formula.startsWith("="))
      return { status: "wrong", message: `Right number, but ${cells[i]} still holds a formula. Paste it back as a plain value (Paste Special > Values).` };
    const missing = functions.filter((fn) => !formula.includes(`${fn.toUpperCase()}(`));
    if (missing.length > 0) return { status: "wrong", message: `Right number! This task wants you to use ${missing.join(" and ")} in ${cells[i]}.` };
    const squeezed = formula.replace(/\s/g, "");
    const absent = task.formula_contains.find((bit) => !squeezed.includes(bit.toUpperCase().replace(/\s/g, "")));
    if (absent) return { status: "wrong", message: `Close! Your number is right, but the formula needs to use ${absent}.` };
  }

  // Number format: a cell still in General isn't formatted yet; any other format is a miss
  if (task.number_format) {
    const want = task.number_format;
    const off = readings.map((r, i) => ({ cell: cells[i], format: r.numberFormat })).filter((r) => !sameFormat(r.format, want));
    const other = off.find((r) => !sameFormat(r.format, "General"));
    if (other) return { status: "wrong", message: `Close! ${other.cell} has the format ${other.format}, but this task wants ${want}.` };
    if (off.length > 0) return { status: "wait", note: off.length < cells.length ? `Nearly! Format all of ${task.cell}.` : undefined };
  }

  // Font colour: a cell still in the default black isn't done yet; any other colour is a miss
  if (task.font_color) {
    const off = readings.map((r, i) => ({ cell: cells[i], colour: r.fontColor })).filter((r) => !isBlue(r.colour));
    const black = (c: string | null) => !c || normalColour(c) === "#000000";
    const other = off.find((r) => !black(r.colour));
    if (other) return { status: "wrong", message: `Close! The font in ${other.cell} needs to be blue.` };
    if (off.length > 0) return { status: "wait", note: off.length < cells.length ? `Nearly! Make all of ${task.cell} blue.` : undefined };
  }

  if (onSheet && onSheet.status !== "pass") {
    // The cells are right, but the panel isn't set yet
    if (onSheet.status === "wait" && !onSheet.note && (task.pivot || task.chart))
      return { status: "wait", note: `Right answer! Now finish the ${task.chart ? "chart" : "pivot table"} in the Insights panel.` };
    return onSheet;
  }
  if (!selectedOk) return { status: "wait", note: `Right answer! Now select ${task.selected}.` };
  if (needKeys) return { status: "wait", note: `Right answer! ${keysNote} Clear the cell and try again.` };
  return { status: "pass" };
}
