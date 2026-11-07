"use client";

import { useEffect, useRef } from "react";
import "@univerjs/preset-sheets-core/lib/index.css";
import "@univerjs/preset-sheets-conditional-formatting/lib/index.css";
import "@univerjs/preset-sheets-sort/lib/index.css";
import "@univerjs/preset-sheets-filter/lib/index.css";
import "@univerjs/preset-sheets-data-validation/lib/index.css";
import "@univerjs/preset-sheets-table/lib/index.css";
import "@univerjs/preset-sheets-find-replace/lib/index.css";
import type { FUniver, IWorkbookData } from "@univerjs/presets";
import type {} from "@univerjs/preset-sheets-core"; // adds the spreadsheet parts to FUniver's type
import type {} from "@univerjs/preset-sheets-conditional-formatting"; // and conditional formatting,
import type {} from "@univerjs/preset-sheets-sort"; // sorting,
import type {} from "@univerjs/preset-sheets-filter"; // filters
import type {} from "@univerjs/preset-sheets-data-validation"; // data validation
import type { TableColumnFilterTypeEnum } from "@univerjs/preset-sheets-table"; // tables
import type {} from "@univerjs/preset-sheets-find-replace"; // and Find & Replace
import type { ConditionalFormat, ExcelSheet, ExcelValue, Validation } from "@/lib/learn/lesson-types";
import type { Reading, Selection, SheetLayout, SheetRule, SheetValidation } from "@/lib/learn/excel/grade";
import type { Step } from "@/lib/learn/excel/answer";
import { cellName, cellsIn, parseCell } from "@/lib/learn/excel/cells";
import { seek } from "@/lib/learn/excel/goal-seek";

// A real Excel-style spreadsheet (Univer) for Excel lessons.
// The lesson reads cells, locks cells and fills in answers through the `SheetApi` it gets from onReady.

// What the learner may change right now. Everything else is locked.
export type LockRules = {
  sheet: string; // the sheet the cells are on
  cells: Set<string>; // e.g. "D2"
  structure: boolean; // inserting and deleting rows and columns
  message: string; // shown when a paste, fill or delete on locked cells is undone
  editMessage: string; // shown when the learner starts typing in a locked cell
};

export type SheetApi = {
  read: (sheet: string | undefined, cell: string) => Reading;
  conditionalFormats: (sheet: string | undefined) => SheetRule[];
  layout: (sheet: string | undefined) => SheetLayout;
  selection: () => Selection;
  select: (sheet: string | undefined, range: string) => void;
  showSheet: (sheet: string) => void; // bring this sheet's tab to the front
  setKeyboardOnly: (on: boolean) => void; // on: clicks in the grid are blocked (a keyboard-only task)
  // The block of filled cells around a cell (default: the selected one), like Excel's "current region"
  regionAround: (sheet?: string, cell?: string) => { sheet: string; range: string } | null;
  // A block's values, and each column's number format (from its first row under the header)
  readBlock: (sheet: string, range: string) => { values: ExcelValue[][]; formats: string[] };
  // Goal Seek on the sheet in front: try values in `changing` until `set` (a formula) equals `target`,
  // then write the answer there (as the learner, so the locks apply and one Ctrl+Z undoes it)
  goalSeek: (set: string, target: number, changing: string) => Promise<GoalSeekResult>;
  highlight: (sheet: string | undefined, ranges: string[]) => () => void; // returns "remove the highlight"
  setRules: (rules: LockRules | null) => void; // null: nothing locked
  // Carry out answer steps. `asLearner`: obey the locks, like the learner's own changes (for the tester).
  run: (sheet: string | undefined, steps: Step[], asLearner?: boolean) => Promise<void>;
  snapshot: () => unknown;
  restore: (snapshot: unknown) => void;
  focus: () => void; // put the keyboard back on the grid
};

export type GoalSeekResult = { found: true; value: number } | { found: false; message: string };

// The lesson's sheets in Univer's workbook format
function toWorkbook(id: string, sheets: ExcelSheet[]): Partial<IWorkbookData> {
  const sheetIds = sheets.map((_, i) => `sheet-${i + 1}`);
  // Shared cell styles: the bold header, and one per number format (bold too on a header cell)
  const styles: Record<string, { bl?: number; n?: { pattern: string } }> = { header: { bl: 1 } };
  const formatStyle = (pattern: string, bold: boolean) => {
    const key = `${bold ? "header-" : ""}format-${Object.keys(styles).length}`;
    const existing = Object.entries(styles).find(([, st]) => st.n?.pattern === pattern && !!st.bl === bold)?.[0];
    if (existing) return existing;
    styles[key] = { ...(bold && { bl: 1 }), n: { pattern } };
    return key;
  };
  return {
    id: `workbook-${id}`,
    name: id,
    sheetOrder: sheetIds,
    styles,
    sheets: Object.fromEntries(
      sheets.map((sheet, i) => {
        const cellData: Record<number, Record<number, { v?: ExcelValue; t?: number; f?: string; s?: string }>> = {};
        sheet.rows.forEach((row, r) => {
          row.forEach((value, c) => {
            if (value === null || value === "") return;
            const isFormula = typeof value === "string" && value.startsWith("=");
            (cellData[r] ??= {})[c] = {
              // Each value keeps its type: "1200" in quotes stays text (Univer would otherwise read it as a number)
              ...(isFormula ? { f: value } : { v: value, t: CELL_TYPE[typeof value as keyof typeof CELL_TYPE] }),
              ...(sheet.header && r === 0 && { s: "header" }),
            };
          });
        });
        // Number formats, on empty cells too: a formula typed there later shows in the format
        for (const [range, pattern] of Object.entries(sheet.number_formats ?? {})) {
          for (const cell of cellsIn(range)) {
            const { row: r, col: c } = parseCell(cell);
            ((cellData[r] ??= {})[c] ??= {}).s = formatStyle(pattern, sheet.header && r === 0);
          }
        }
        const formatCols = Object.keys(sheet.number_formats ?? {}).flatMap((range) => cellsIn(range).map((cell) => parseCell(cell).col + 1));
        const width = Math.max(0, ...sheet.rows.map((row) => row.length), ...formatCols);
        return [
          sheetIds[i],
          {
            id: sheetIds[i],
            name: sheet.name,
            rowCount: Math.max(100, sheet.rows.length + 20),
            columnCount: Math.max(20, width + 6),
            cellData,
            columnData: Object.fromEntries((sheet.column_widths ?? []).map((w, c) => [c, { w }])),
          },
        ];
      })
    ),
  } as Partial<IWorkbookData>;
}

// Univer's CellValueType for each kind of value in a lesson file
const CELL_TYPE = { string: 1, number: 2, boolean: 3 } as const;

// Typed text as a cell: "=B2*C2" is a formula, "1.25" a number, anything else text
function cellFromText(text: string) {
  const t = text.trim();
  if (t.startsWith("=")) return { f: t };
  if (/^-?\d+(\.\d+)?$/.test(t)) return { v: Number(t) };
  return { v: t };
}

// A conditional formatting rule as Univer stores it, in the lesson file's words
type UniverRule = {
  ranges: { startRow: number; startColumn: number; endRow: number; endColumn: number }[];
  rule: { type: string; subType?: string; operator?: string; value?: unknown; style?: { bg?: { rgb?: string } } };
};
const RULE_TYPES: Record<string, ConditionalFormat["type"]> = {
  "number.greaterThan": "greater_than",
  "number.lessThan": "less_than",
  "number.between": "between",
  "number.equal": "equal_to",
  "text.equal": "equal_to",
  "text.containsText": "text_contains",
};
function toSheetRule({ ranges, rule }: UniverRule): SheetRule {
  const type =
    rule.type !== "highlightCell" ? null : rule.subType === "duplicateValues" ? "duplicate" : RULE_TYPES[`${rule.subType}.${rule.operator}`] ?? null;
  return {
    ranges: ranges.map((r) => `${cellName(r.startColumn, r.startRow)}:${cellName(r.endColumn, r.endRow)}`),
    type,
    value: rule.value,
    fill: rule.style?.bg?.rgb ?? null,
  };
}

// Univer commands and changes that insert, delete or move rows, columns or cells
const STRUCTURE_COMMAND = /^sheet\.command\.((insert|remove|delete)-(row|col|range)|move-(rows|cols|range))/;
const STRUCTURE_MUTATION = /^sheet\.mutation\.(insert-row|insert-col|remove-rows|remove-col|move-rows|move-columns|move-range)$/;
const SET_VALUES = "sheet.mutation.set-range-values";
const COMMAND = 0; // Univer's CommandType: a learner action (edit, paste, fill, undo…)
const MUTATION = 2; // a change it makes to the sheet

// A lesson's conditional format as a Univer rule (fill: Excel's usual light red unless the lesson names one)
function buildRule(ws: ReturnType<ReturnType<FUniver["createWorkbook"]>["getSheets"]>[number], cf: ConditionalFormat) {
  const start = ws.newConditionalFormattingRule();
  const v = cf.value;
  const rule =
    cf.type === "greater_than" ? start.whenNumberGreaterThan(Number(v))
    : cf.type === "less_than" ? start.whenNumberLessThan(Number(v))
    : cf.type === "between" ? start.whenNumberBetween(...(v as [number, number]))
    : cf.type === "equal_to" ? (typeof v === "number" ? start.whenNumberEqualTo(v) : start.whenTextEqualTo(String(v)))
    : cf.type === "text_contains" ? start.whenTextContains(String(v))
    : start.setDuplicateValues();
  return rule.setBackground(cf.fill ?? "#FFC7CE").setRanges([ws.getRange(cf.range).getRange()]).build();
}

type Sheet = ReturnType<ReturnType<FUniver["createWorkbook"]>["getSheets"]>[number];

// A data validation rule as Univer stores it, in the lesson file's words
function toSheetValidation(dv: ReturnType<Sheet["getDataValidations"]>[number]): SheetValidation {
  const ranges = dv.getRanges().map((r) => r.getA1Notation());
  const type = dv.getCriteriaType();
  const [operator, formula1 = "", formula2 = ""] = dv.getCriteriaValues();
  if (type === "list") return { ranges, type: "list", values: listValues(formula1) };
  if (type === "whole") {
    if (operator === "between") return { ranges, type: "whole_number", min: Number(formula1), max: Number(formula2) };
    if (operator === "greaterThanOrEqual") return { ranges, type: "whole_number", min: Number(formula1) };
    if (operator === "lessThanOrEqual") return { ranges, type: "whole_number", max: Number(formula1) };
  }
  return { ranges, type: null };
}

// A dropdown's choices: Univer keeps them as a JSON list or as "a,b,c"
function listValues(text: string): string[] {
  try {
    const list = JSON.parse(text);
    if (Array.isArray(list) && list.every((x) => typeof x === "string")) return list.filter(Boolean);
  } catch {}
  return text.split(",").map((x) => x.trim()).filter(Boolean);
}

// A lesson's data validation as a Univer rule. Wrong entries are blocked, like Excel's default.
function buildValidation(api: FUniver, rule: Validation) {
  const b = api.newDataValidation();
  const checked =
    rule.type === "list"
      ? b.requireValueInList(rule.values)
      : rule.min !== undefined && rule.max !== undefined
        ? b.requireNumberBetween(rule.min, rule.max, true)
        : rule.min !== undefined
          ? b.requireNumberGreaterThanOrEqualTo(rule.min, true)
          : b.requireNumberLessThanOrEqualTo(rule.max!, true);
  return checked.setAllowInvalid(false).build();
}

// Which columns to filter, and to which values, so that exactly `want` (row indexes) is hidden among
// `dataRows`: the columns with the fewest choices first, like a learner would. null: filters can't do it.
function pickFilters(dataRows: number[], columns: number[], want: Set<number>, textOf: (row: number, col: number) => string) {
  if (![...want].every((r) => dataRows.includes(r))) return null;
  const options = columns
    .map((col) => {
      const shown = new Set(dataRows.filter((r) => !want.has(r)).map((r) => textOf(r, col)));
      return { col, shown, hides: dataRows.filter((r) => !shown.has(textOf(r, col))) };
    })
    .filter((c) => c.hides.length > 0)
    .sort((a, b) => a.shown.size - b.shown.size);
  const hidden = new Set<number>();
  const used: typeof options = [];
  for (const c of options) {
    if (hidden.size === want.size) break;
    if (c.hides.some((r) => !hidden.has(r))) {
      used.push(c);
      c.hides.forEach((r) => hidden.add(r));
    }
  }
  return hidden.size === want.size ? used : null;
}

const TABLE_EMPTY = "__UNIVER_TABLE_FILTER_EMPTY__"; // how a table filter says "blank cells"
const span = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => from + i);

// Make exactly these rows hidden (numbers as on screen), with value filters where they can do it:
// a table's own filter arrows when the rows are in a table, otherwise the sheet's filter (or a new one
// on the data). Rows filters can't pick out are hidden instead.
function hideExactly(ws: Sheet, rows: number[], textOf: (row: number, col: number) => string) {
  // First, everything showing
  ws.getFilter()?.removeFilterCriteria();
  const tables = ws.getSubTableInfos();
  for (const t of tables) for (let c = 0; c <= t.range.endColumn - t.range.startColumn; c++) ws.resetFilter(t.id, c);
  ws.showRows(0, ws.getMaxRows());
  if (rows.length === 0) return;
  const want = new Set(rows.map((r) => r - 1));

  const table = tables.find((t) => [...want].every((r) => r > t.range.startRow && r <= t.range.endRow));
  if (table) {
    const { startRow, endRow, startColumn, endColumn } = table.range;
    const picked = pickFilters(span(startRow + 1, endRow), span(startColumn, endColumn), want, textOf);
    if (picked) {
      for (const { col, shown } of picked)
        ws.setTableFilter(table.id, col - startColumn, { filterType: "manual" as TableColumnFilterTypeEnum.manual, values: [...shown].map((v) => v || TABLE_EMPTY) });
      return;
    }
  } else {
    const filter = ws.getFilter() ?? ws.getDataRange().createFilter();
    if (filter) {
      const area = filter.getRange();
      const top = area.getRow(); // the header row, with the filter buttons
      const picked = pickFilters(
        span(top + 1, top + area.getHeight() - 1),
        span(area.getColumn(), area.getColumn() + area.getWidth() - 1),
        want,
        textOf
      );
      if (picked) {
        for (const { col, shown } of picked)
          filter.setColumnFilterCriteria(col, { colId: col, filters: { filters: [...shown].filter(Boolean), ...(shown.has("") && { blank: true as const }) } });
        return;
      }
    }
  }
  for (const r of want) ws.hideRows(r, 1);
}

// A table on exactly this range: renamed if one is there already, otherwise made (tables in the way are
// removed first). With no name, Univer names it Table1, Table2...
function makeTable(ws: Sheet, a1: string, name: string | undefined) {
  const r = ws.getRange(a1);
  const range = { startRow: r.getRow(), startColumn: r.getColumn(), endRow: r.getRow() + r.getHeight() - 1, endColumn: r.getColumn() + r.getWidth() - 1 };
  const tables = ws.getSubTableInfos();
  const same = tables.find((t) => (Object.keys(range) as (keyof typeof range)[]).every((k) => t.range[k] === range[k]));
  if (same) {
    if (name && same.name.toLowerCase() !== name.toLowerCase()) ws.setTableName(same.id, name);
    return;
  }
  const overlaps = (t: (typeof tables)[number]) =>
    t.range.startRow <= range.endRow && range.startRow <= t.range.endRow && t.range.startColumn <= range.endColumn && range.startColumn <= t.range.endColumn;
  tables.filter(overlaps).forEach((t) => ws.removeTable(t.id));
  ws.addTable(name ?? "", range);
}

const columnLetters = (col: number) => cellName(col, 0).replace(/\d+$/, "");

export default function Spreadsheet({
  id,
  sheets,
  onReady,
  onClosed,
  onValues,
  onSelection,
  onBlocked,
  onInsights,
  onGoalSeek,
}: {
  id: string;
  sheets: ExcelSheet[];
  onReady: (api: SheetApi) => void;
  onClosed: () => void; // the spreadsheet was shut down: its SheetApi can't be used any more
  onValues: () => void; // a change was committed and formulas have finished calculating
  onSelection: () => void; // the selection changed (after a mouse drag ends)
  onBlocked: (message: string) => void; // the learner tried to change a locked cell
  onInsights: (tab: "pivot" | "chart") => void; // the Pivot table or Chart toolbar button was pressed
  onGoalSeek: () => void; // the Goal Seek toolbar button was pressed
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const savedWork = useRef<IWorkbookData | null>(null); // the sheet when this page was last hidden
  // Keep the latest callbacks without rebuilding the spreadsheet
  const callbacks = useRef({ onReady, onClosed, onValues, onSelection, onBlocked, onInsights, onGoalSeek });
  useEffect(() => {
    callbacks.current = { onReady, onClosed, onValues, onSelection, onBlocked, onInsights, onGoalSeek };
  });

  // Build the spreadsheet. Univer only runs in the browser, so it loads here. Next.js also runs
  // this when the learner comes back to a hidden lesson: the sheet is rebuilt from their saved work.
  useEffect(() => {
    let cancelled = false;
    let cleanup = () => {};

    (async () => {
      const [
        { createUniver, LocaleType, mergeLocales, extractPureTextFromCell },
        { UniverSheetsCorePreset },
        { default: enUS },
        { UniverSheetsConditionalFormattingPreset },
        { default: cfEnUS },
        { UniverSheetsSortPreset },
        { default: sortEnUS },
        { UniverSheetsFilterPreset },
        { default: filterEnUS },
        { UniverSheetsDataValidationPreset },
        { default: dvEnUS },
        { UniverSheetsTablePreset },
        { default: tableEnUS },
        { UniverSheetsFindReplacePreset },
        { default: findEnUS },
      ] = await Promise.all([
        import("@univerjs/presets"),
        import("@univerjs/preset-sheets-core"),
        import("@univerjs/preset-sheets-core/locales/en-US"),
        import("@univerjs/preset-sheets-conditional-formatting"),
        import("@univerjs/preset-sheets-conditional-formatting/locales/en-US"),
        import("@univerjs/preset-sheets-sort"),
        import("@univerjs/preset-sheets-sort/locales/en-US"),
        import("@univerjs/preset-sheets-filter"),
        import("@univerjs/preset-sheets-filter/locales/en-US"),
        import("@univerjs/preset-sheets-data-validation"),
        import("@univerjs/preset-sheets-data-validation/locales/en-US"),
        import("@univerjs/preset-sheets-table"),
        import("@univerjs/preset-sheets-table/locales/en-US"),
        import("@univerjs/preset-sheets-find-replace"),
        import("@univerjs/preset-sheets-find-replace/locales/en-US"),
      ]);
      const box = boxRef.current;
      if (cancelled || !box) return;

      const { univer, univerAPI } = createUniver({
        locale: LocaleType.EN_US,
        locales: { [LocaleType.EN_US]: mergeLocales(enUS, cfEnUS, sortEnUS, filterEnUS, dvEnUS, tableEnUS, findEnUS) },
        presets: [
          UniverSheetsCorePreset({ container: box, disableAutoFocus: true }),
          UniverSheetsConditionalFormattingPreset(),
          UniverSheetsSortPreset(),
          UniverSheetsFilterPreset(),
          UniverSheetsDataValidationPreset(),
          UniverSheetsTablePreset(),
          UniverSheetsFindReplacePreset(),
        ],
      });
      const api = univerAPI as FUniver;
      let workbook = api.createWorkbook(savedWork.current ?? toWorkbook(id, sheets));
      const sheetFor = (name: string | undefined) => (name ? workbook.getSheetByName(name) : null) ?? workbook.getSheets()[0];

      let rules: LockRules | null = null;
      let trusted = false; // our own changes (answers, undoing a blocked change) skip the locks
      let inStructure = false; // inside an allowed insert/delete, which also rewrites formulas elsewhere
      // How many learner actions are running. Changes outside them (formula results) are never locked.
      let actions = 0;
      let actionsSince = 0;
      const allowed = (sheetName: string, row: number, col: number) =>
        !rules || (sheetName === rules.sheet && rules.cells.has(cellName(col, row)));
      const blocked = (typing = false) => rules && callbacks.current.onBlocked(typing ? rules.editMessage : rules.message);

      // ---- After a change is committed, wait for formulas to finish, then tell the lesson ----
      let valueTimer: number | undefined;
      let calculatingSince = 0; // when formulas started calculating (0: they aren't)
      let seeking = false; // Goal Seek is trying values: the lesson doesn't grade those
      const valuesChanged = () => {
        if (seeking) return;
        clearTimeout(valueTimer);
        valueTimer = window.setTimeout(() => {
          // Still calculating: wait, but never more than 3 seconds
          if (calculatingSince && Date.now() - calculatingSince < 3000) return valuesChanged();
          callbacks.current.onValues();
        }, 250);
      };

      // ---- Locked cells that got changed anyway (paste, fill handle, delete key…) are put back ----
      const originals = new Map<string, { unitId: string; subUnitId: string; row: number; col: number; data: unknown }>();
      let restoreTimer: number | undefined;
      function putBack() {
        const byCell = [...originals.values()];
        originals.clear();
        if (byCell.length === 0) return;
        trusted = true;
        try {
          // First empty each cell, then put its old contents back (a change only adds to a cell)
          for (const subUnitId of new Set(byCell.map((c) => c.subUnitId))) {
            const onSheet = byCell.filter((c) => c.subUnitId === subUnitId);
            for (const pass of ["clear", "restore"] as const) {
              const cellValue: Record<number, Record<number, unknown>> = {};
              for (const { row, col, data } of onSheet) {
                if (pass === "restore" && !data) continue;
                (cellValue[row] ??= {})[col] = pass === "clear" ? null : data;
              }
              if (Object.keys(cellValue).length > 0)
                api.syncExecuteCommand(SET_VALUES, { unitId: onSheet[0].unitId, subUnitId, cellValue });
            }
          }
        } finally {
          trusted = false;
        }
        blocked();
        valuesChanged();
      }

      const listeners = [
        api.addEvent(api.Event.SheetValueChanged, valuesChanged),
        api.getFormula().calculationStart(() => {
          calculatingSince = Date.now();
        }),
        api.getFormula().calculationEnd(() => {
          calculatingSince = 0;
          valuesChanged();
        }),

        // Typing into a locked cell: stop the editor from opening at all
        api.addEvent(api.Event.BeforeSheetEditStart, (p) => {
          if (!trusted && !allowed(p.worksheet.getSheetName(), p.row, p.column)) {
            p.cancel = true;
            blocked(true);
          }
        }),

        api.addEvent(api.Event.CommandExecuted, (e) => {
          if (e.type === COMMAND) {
            actions = Math.max(0, actions - 1);
            valuesChanged(); // e.g. a row deleted: no value event, but the task may be done
          }
        }),

        api.addEvent(api.Event.BeforeCommandExecute, (e) => {
          if (trusted || !rules) return;
          if (e.type === COMMAND) {
            // An action that failed never reports back, so don't trust an old count
            if (actions > 0 && Date.now() - actionsSince > 5000) actions = 0;
            actions++;
            actionsSince = Date.now();
          }
          // Inserting or deleting rows and columns: only in tasks that teach it
          if (e.type !== MUTATION && STRUCTURE_COMMAND.test(e.id)) {
            if (!rules.structure) {
              e.cancel = true;
              actions--; // cancelled, so it won't report back
              blocked();
            } else {
              inStructure = true;
              window.setTimeout(() => (inStructure = false), 0);
            }
            return;
          }
          if (e.type === MUTATION && STRUCTURE_MUTATION.test(e.id) && !rules.structure) {
            e.cancel = true; // e.g. undoing an insert from an earlier task
            blocked();
            return;
          }
          // Any other change to locked cells: remember them as they were, and put them back after
          if (e.id === SET_VALUES && actions > 0 && !inStructure) {
            const { unitId, subUnitId, cellValue } = e.params as {
              unitId: string;
              subUnitId: string;
              cellValue: Record<string, Record<string, unknown>>;
            };
            const ws = workbook.getSheetBySheetId(subUnitId);
            if (!ws) return;
            for (const [r, cols] of Object.entries(cellValue ?? {})) {
              for (const c of Object.keys(cols ?? {})) {
                const row = Number(r);
                const col = Number(c);
                if (allowed(ws.getSheetName(), row, col)) continue;
                const key = `${subUnitId}!${row}:${col}`;
                if (!originals.has(key)) {
                  const data = ws.getRange(row, col).getCellData();
                  originals.set(key, { unitId, subUnitId, row, col, data: data ? JSON.parse(JSON.stringify(data)) : null });
                }
              }
            }
            if (originals.size > 0) {
              clearTimeout(restoreTimer);
              restoreTimer = window.setTimeout(putBack, 0);
            }
          }
        }),
      ];

      // ---- Selection: tell the lesson on every change, but wait for a mouse drag to end ----
      let pointerDown = false;
      let selectionTimer: number | undefined;
      const selectionChanged = () => {
        clearTimeout(selectionTimer);
        selectionTimer = window.setTimeout(() => {
          if (!pointerDown) callbacks.current.onSelection();
        }, 60);
      };
      // (Univer's own SelectionChanged event doesn't fire here, so watch the command that sets it)
      listeners.push(
        api.addEvent(api.Event.CommandExecuted, (e) => {
          if (e.id === "sheet.operation.set-selections") selectionChanged();
        })
      );
      // ---- Sorting leaves a lesson sheet's header row in place (Excel guesses this; Univer doesn't) ----
      const withHeader = new Set(sheets.filter((s) => s.header).map((s) => s.name));
      listeners.push(
        api.addEvent(api.Event.BeforeCommandExecute, (e) => {
          if (e.id !== "sheet.command.sort-range") return;
          const p = e.params as { range: { startRow: number }; hasTitle?: boolean; subUnitId?: string };
          const ws = p.subUnitId ? workbook.getSheetBySheetId(p.subUnitId) : workbook.getActiveSheet();
          if (ws && p.range.startRow === 0 && withHeader.has(ws.getSheetName())) p.hasTitle = true;
        })
      );

      // ---- Paste Special > Transpose (Univer doesn't have it): the last copied cells, rows turned into columns ----
      let copied: { sheet: string; range: string } | null = null;
      listeners.push(
        api.addEvent(api.Event.CommandExecuted, (e) => {
          if (e.id !== "univer.command.copy") return;
          const range = workbook.getActiveRange();
          copied = range ? { sheet: workbook.getActiveSheet().getSheetName(), range: range.getA1Notation() } : null;
        })
      );
      const pasteTranspose = () => {
        const target = workbook.getActiveRange();
        if (!copied || !target) return;
        const source = sheetFor(copied.sheet).getRange(copied.range);
        const from = { row: source.getRow(), col: source.getColumn() };
        const to = { row: target.getRow(), col: target.getColumn() };
        const grid = source.getCellDatas();
        // Cell (r, c) of the copy lands at (c, r) of the paste; formulas shift to their new spot, like a paste
        const pasted = grid[0].map((_, c) =>
          grid.map((row, r) => {
            const cell = row[c];
            if (!cell) return { v: null };
            const shift = (f: string) => api.getFormula().moveFormulaRefOffset(f, to.col + r - (from.col + c), to.row + c - (from.row + r));
            return { ...(cell.f ? { f: shift(cell.f) } : { v: cell.v ?? null }), ...(cell.s && { s: cell.s }) };
          })
        );
        workbook.getActiveSheet().getRange(to.row, to.col, pasted.length, pasted[0].length).setValues(pasted);
      };
      api
        .createMenu({ id: "analyzely.paste-transpose", title: "Transpose", order: 4, action: pasteTranspose })
        .appendTo(["contextMenu.mainArea", "contextMenu.format", "sheet.menu.paste-special"]);

      // ---- Insert Table and Rename Table on the right-click menu (Univer puts rename only on the table's name tag) ----
      api
        .createMenu({ id: "analyzely.insert-table", title: "Insert Table", order: 0, action: "sheet.operation.open-table-selector" })
        .appendTo(["contextMenu.mainArea", "contextMenu.others"]);
      const renameTable = () => {
        const ws = workbook.getActiveSheet();
        const cell = workbook.getActiveRange();
        const table = cell ? ws.getTableByCell(cell.getRow(), cell.getColumn()) : undefined;
        if (!table) return callbacks.current.onBlocked("Click a cell inside the table first, then choose Rename Table.");
        // Univer's own rename dialog, the one its table menu opens
        const dialog = api.openDialog({
          id: "SHEET_TABLE_RENAME_DIALOG_ID",
          title: { title: "Rename Table" },
          draggable: true,
          mask: true,
          width: 360,
          children: { label: { name: "SHEET_TABLE_RENAME_DIALOG", props: { unitId: workbook.getId(), tableId: table.id, onClose: () => dialog.dispose() } } },
          onClose: () => dialog.dispose(),
        });
      };
      api
        .createMenu({ id: "analyzely.rename-table", title: "Rename Table", order: 1, action: renameTable })
        .appendTo(["contextMenu.mainArea", "contextMenu.others"]);

      // ---- Pivot table and Chart on the Insert tab: they open the Insights panel beside the grid ----
      for (const [tab, title] of [
        ["pivot", "Pivot table"],
        ["chart", "Chart"],
      ] as const)
        api
          .createMenu({ id: `analyzely.insights-${tab}`, title, tooltip: title, action: () => callbacks.current.onInsights(tab) })
          .appendTo("ribbon.insert.others");

      // ---- Goal Seek on the Data tab (Univer has none): the lesson shows its box ----
      api
        .createMenu({ id: "analyzely.goal-seek", title: "Goal Seek", tooltip: "Goal Seek", action: () => callbacks.current.onGoalSeek() })
        .appendTo("ribbon.data.others");

      // ---- Keyboard-only tasks: clicks on the grid (its canvas) never reach Univer, so nothing moves ----
      let keyboardOnly = false;
      const noMouse = (e: Event) => {
        if (!keyboardOnly || !(e.target instanceof HTMLCanvasElement)) return;
        e.preventDefault();
        e.stopPropagation();
        if (e.type === "pointerdown") {
          callbacks.current.onBlocked("Keyboard only! Use the keys instead of the mouse.");
          sheetApi.focus();
        }
      };
      const mouseEvents = ["pointerdown", "mousedown", "dblclick", "contextmenu"];
      mouseEvents.forEach((type) => box.addEventListener(type, noMouse, true));

      const down = () => (pointerDown = true);
      const up = () => {
        if (!pointerDown) return;
        pointerDown = false;
        selectionChanged();
      };
      box.addEventListener("pointerdown", down, true);
      window.addEventListener("pointerup", up, true);

      // Our own changes, outside the locks
      const asOurs = <T,>(fn: () => T): T => {
        trusted = true;
        try {
          return fn();
        } finally {
          trusted = false;
        }
      };

      const sheetApi: SheetApi = {
        read(sheet, cell) {
          const range = sheetFor(sheet).getRange(cell);
          return {
            value: (range.getValue() ?? null) as ExcelValue,
            formula: range.getFormula() ?? "",
            numberFormat: range.getNumberFormat() ?? "",
            fontColor: range.getCellStyleData()?.cl?.rgb ?? null,
          };
        },
        conditionalFormats(sheet) {
          return (sheetFor(sheet).getConditionalFormattingRules() as unknown as UniverRule[]).map(toSheetRule);
        },
        layout(sheet) {
          const ws = sheetFor(sheet);
          const model = ws.getSheet();
          const upTo = (n: number) => Array.from({ length: n }, (_, i) => i);
          return {
            hiddenRows: upTo(ws.getMaxRows()).filter((r) => !model.getRowVisible(r)).map((r) => r + 1),
            hiddenColumns: upTo(ws.getMaxColumns()).filter((c) => !model.getColVisible(c)).map(columnLetters),
            frozen: { rows: ws.getFrozenRows(), columns: ws.getFrozenColumns() },
            validations: ws.getDataValidations().map(toSheetValidation),
            tables: ws.getSubTableInfos().map((t) => ({
              range: `${cellName(t.range.startColumn, t.range.startRow)}:${cellName(t.range.endColumn, t.range.endRow)}`,
              name: t.name,
            })),
          };
        },
        selection() {
          const range = workbook.getActiveRange();
          return range ? { sheet: workbook.getActiveSheet().getSheetName(), range: range.getA1Notation() } : null;
        },
        setKeyboardOnly(on) {
          keyboardOnly = on;
        },
        showSheet(sheet) {
          workbook.setActiveSheet(sheetFor(sheet));
        },
        regionAround(sheet, cell) {
          const ws = sheet ? sheetFor(sheet) : workbook.getActiveSheet();
          const active = workbook.getActiveRange();
          const start = cell ? parseCell(cell) : active ? { row: active.getRow(), col: active.getColumn() } : null;
          if (!start) return null;
          const rowCount = Math.min(ws.getMaxRows(), ws.getLastRow() + 2);
          const colCount = Math.min(ws.getMaxColumns(), ws.getLastColumn() + 2);
          const grid = ws.getRange(0, 0, rowCount, colCount).getValues();
          const filled = (r: number, c: number) => r >= 0 && c >= 0 && r < rowCount && c < colCount && grid[r][c] !== null && grid[r][c] !== "";
          const span = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
          const any = (rows: number[], cols: number[]) => rows.some((r) => cols.some((c) => filled(r, c)));
          let [top, bottom, left, right] = [start.row, start.row, start.col, start.col];
          // Grow while a filled cell touches the block (corners too)
          for (let grew = true; grew; ) {
            grew = false;
            if (any([top - 1], span(left - 1, right + 1))) [top, grew] = [top - 1, true];
            if (any([bottom + 1], span(left - 1, right + 1))) [bottom, grew] = [bottom + 1, true];
            if (any(span(top, bottom), [left - 1])) [left, grew] = [left - 1, true];
            if (any(span(top, bottom), [right + 1])) [right, grew] = [right + 1, true];
          }
          if (!any(span(top, bottom), span(left, right))) return null;
          return { sheet: ws.getSheetName(), range: `${cellName(left, top)}:${cellName(right, bottom)}` };
        },
        readBlock(sheet, range) {
          const ws = sheetFor(sheet);
          const block = ws.getRange(range);
          const formats = Array.from({ length: block.getWidth() }, (_, c) =>
            ws.getRange(block.getRow() + 1, block.getColumn() + c).getNumberFormat() ?? ""
          );
          return { values: block.getValues() as ExcelValue[][], formats };
        },
        async goalSeek(set, target, changing) {
          const ws = workbook.getActiveSheet();
          const setRange = ws.getRange(set);
          const changeRange = ws.getRange(changing);
          if (!setRange.getFormula()) return { found: false, message: `${set} needs a formula for Goal Seek to aim at.` };
          if (changeRange.getFormula()) return { found: false, message: `${changing} must hold a number, not a formula.` };
          const { row, col } = parseCell(changing);
          if (!allowed(ws.getSheetName(), row, col)) return { found: false, message: rules?.message ?? `${changing} can't be changed.` };
          const original = changeRange.getValue();
          const unitId = workbook.getId();
          const subUnitId = ws.getSheetId();
          // Try a value: write it straight into the cell (no undo step, no lock check), then wait for formulas
          const write = async (v: ExcelValue) => {
            const recalculated = api.getFormula().onCalculationResultApplied(3000).catch(() => {});
            asOurs(() =>
              api.syncExecuteCommand(SET_VALUES, { unitId, subUnitId, cellValue: { [row]: { [col]: { v, t: typeof v === "number" ? 2 : 1 } } } })
            );
            await recalculated;
          };
          seeking = true;
          try {
            const answer = await seek(async (x) => {
              await write(x);
              const result = setRange.getValue();
              return typeof result === "number" ? result - target : NaN;
            }, typeof original === "number" ? original : Number(original) || 0);
            await write(original); // back to the start, so the final write is one clean step
            if (answer === null) return { found: false, message: "No solution found." };
            seeking = false;
            changeRange.setValue(answer);
            return { found: true, value: answer };
          } finally {
            seeking = false;
            valuesChanged();
          }
        },
        select(sheet, range) {
          const ws = sheetFor(sheet);
          workbook.setActiveSheet(ws);
          ws.getRange(range).activate();
        },
        highlight(sheet, ranges) {
          const target = sheetFor(sheet);
          workbook.setActiveSheet(target);
          const marks = ranges.map((r) => target.getRange(r).highlight());
          return () => marks.forEach((m) => m.dispose());
        },
        setRules(next) {
          rules = next;
        },
        async run(sheet, steps, asLearner = false) {
          const ws = sheetFor(sheet);
          const act = asLearner ? <T,>(fn: () => T) => fn() : asOurs;
          for (const step of steps) {
            if (step.kind === "set") act(() => ws.getRange(step.cell).setValue(cellFromText(step.value)));
            else if (step.kind === "copy") {
              // Like copy and paste: formulas shift to each new cell, $ parts stay put
              const source = ws.getRange(step.from);
              const formula = source.getFormula();
              const value = source.getValue();
              const from = parseCell(step.from);
              for (const cell of cellsIn(step.to)) {
                const to = parseCell(cell);
                const content = formula
                  ? { f: api.getFormula().moveFormulaRefOffset(formula, to.col - from.col, to.row - from.row) }
                  : { v: value };
                act(() => ws.getRange(cell).setValue(content));
              }
            } else if (step.kind === "insert-row") act(() => ws.insertRowBefore(step.row - 1));
            else if (step.kind === "delete-row") act(() => ws.deleteRow(step.row - 1));
            else if (step.kind === "insert-col") act(() => ws.insertColumnBefore(parseCell(`${step.col}1`).col));
            else if (step.kind === "delete-col") act(() => ws.deleteColumn(parseCell(`${step.col}1`).col));
            else if (step.kind === "number-format") act(() => ws.getRange(step.range).setNumberFormat(step.pattern));
            else if (step.kind === "font-color") act(() => ws.getRange(step.range).setFontColor(step.colour));
            else if (step.kind === "conditional-format") act(() => ws.addConditionalFormattingRule(buildRule(ws, step.rule)));
            else if (step.kind === "hidden-rows")
              act(() => hideExactly(ws, step.rows, (row, col) => extractPureTextFromCell(ws.getSheet().getCell(row, col))));
            else if (step.kind === "hidden-columns")
              act(() => {
                ws.showColumns(0, ws.getMaxColumns());
                for (const col of step.columns) ws.hideColumns(parseCell(`${col}1`).col, 1);
              });
            else if (step.kind === "freeze")
              act(() =>
                step.rows === 0 && step.columns === 0
                  ? ws.cancelFreeze()
                  : ws.setFreeze({ startRow: step.rows || -1, startColumn: step.columns || -1, ySplit: step.rows, xSplit: step.columns })
              );
            else if (step.kind === "table") act(() => makeTable(ws, step.range, step.name));
            else if (step.kind === "validation") act(() => ws.getRange(step.rule.range).setDataValidation(buildValidation(api, step.rule)));
            else if (step.kind === "undo") {
              if (asLearner) await api.undo();
              else {
                trusted = true;
                try {
                  await api.undo();
                } finally {
                  trusted = false;
                }
              }
            }
          }
          valuesChanged();
        },
        // Copies both ways: Univer keeps changing the very object it's given
        snapshot: () => structuredClone(workbook.save()),
        restore(snapshot) {
          asOurs(() => {
            api.disposeUnit(workbook.getId());
            workbook = api.createWorkbook(structuredClone(snapshot) as IWorkbookData);
          });
          valuesChanged();
        },
        focus() {
          // Univer takes key presses through a hidden editor box inside the grid
          box.querySelector<HTMLElement>("[contenteditable='true']")?.focus({ preventScroll: true });
        },
      };
      if (window.__excelTestMode) (window as unknown as { __univerAPI: FUniver }).__univerAPI = api; // for the tester
      callbacks.current.onReady(sheetApi);

      cleanup = () => {
        savedWork.current = sheetApi.snapshot() as IWorkbookData;
        callbacks.current.onClosed();
        clearTimeout(valueTimer);
        clearTimeout(selectionTimer);
        clearTimeout(restoreTimer);
        box.removeEventListener("pointerdown", down, true);
        mouseEvents.forEach((type) => box.removeEventListener(type, noMouse, true));
        window.removeEventListener("pointerup", up, true);
        listeners.forEach((l) => l.dispose());
        univer.dispose();
      };
    })();

    return () => {
      cancelled = true;
      cleanup();
    };
    // Not when the lesson changes: a new lesson gets a new Spreadsheet (see `key` on the lesson page)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <div ref={boxRef} className="h-full w-full" />;
}
