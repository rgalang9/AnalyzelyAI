// Turning a task's "answer" text into steps the spreadsheet can carry out, for "Show answer"
// and the tester. It also tells which cells a task lets the learner change.
//
// Understood answers (see LESSON_TEMPLATE.json):
//   "=B2*C2" or "Water"                      the task's single cell gets this
//   "=B3*C3 in D3, =B4*C4 in D4"             each cell gets its own content ("Type 0.1 in G1" too)
//   "=B2*C2 in D2, then copy down to D8"     then the formula is copied down, like the fill handle
//                                            ("fill down to" and "filled down to" too)
//   "Copy E2:F2 down to row 7"               each cell of a row copied down (or "down to F7")
//   "=$B$10 in F2 copied across to J2"       typed, then copied across (or down) to that cell
//   "Copy B10 to B10:E14"                    one cell copied into a whole range
//   "Copy C2, select C3:C6, then paste"      copy and paste
//   "Right-click row 5's number, then Delete" / "... then Insert"
//   "Insert a column at B" / "Delete column B" / "Insert a row at 6" / "Delete row 5"
//   "... then press Ctrl+Z"                  undo ("Press undo" too)
// Clauses like "Tab", "Enter" and "E2 keeps =SUM(B2:B8)" are just explanation.
// Tasks with number_format, font_color, conditional_format, hidden_rows, hidden_columns, frozen, validation or table get
// that applied after the steps, so their answer can be plain words ("Select B2:B6, then click $ on the
// toolbar"): unknown clauses are skipped.
// A single-cell answer that isn't a formula and isn't the expected value ("Pick VIP from B2's dropdown")
// is words too: Show answer then fills in the expected value.

import type { ConditionalFormat, ExcelTask, Validation } from "../lesson-types";
import { CELL_RE, cellName, cellsIn, parseCell } from "./cells";
import { matches } from "./grade";

export type Step =
  | { kind: "set"; cell: string; value: string }
  | { kind: "copy"; from: string; to: string } // to: a range
  | { kind: "insert-row"; row: number } // row numbers as shown on screen (1 = first row)
  | { kind: "delete-row"; row: number }
  | { kind: "insert-col"; col: string }
  | { kind: "delete-col"; col: string }
  | { kind: "undo" }
  | { kind: "number-format"; range: string; pattern: string }
  | { kind: "font-color"; range: string; colour: string }
  | { kind: "conditional-format"; rule: ConditionalFormat }
  | { kind: "hidden-rows"; rows: number[] } // exactly these rows hidden (by a filter where one can do it)
  | { kind: "hidden-columns"; columns: string[] } // exactly these columns hidden
  | { kind: "freeze"; rows: number; columns: number }
  | { kind: "validation"; rule: Validation }
  | { kind: "table"; range: string; name?: string }; // a table on exactly this range (made or renamed)

// Steps that insert, delete or move rows and columns: allowed only in tasks whose answer has them
const STRUCTURE_STEPS = new Set<Step["kind"]>(["insert-row", "delete-row", "insert-col", "delete-col"]);

const CELL = "([A-Z]{1,3}[1-9]\\d*)";
const RANGE = "([A-Z]{1,3}[1-9]\\d*(?::[A-Z]{1,3}[1-9]\\d*)?)";

// Split at ", " and ". " that aren't inside brackets or quotes (so formulas stay whole)
function clauses(text: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let quote = false;
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') quote = !quote;
    else if (!quote && ch === "(") depth++;
    else if (!quote && ch === ")") depth--;
    else if (!quote && depth === 0 && (ch === "," || ch === ".") && /\s/.test(text[i + 1] ?? "")) {
      parts.push(text.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(text.slice(start));
  return parts.map((p) => p.trim().replace(/^(then|and)\s+/i, "").trim()).filter(Boolean);
}

const looksLikeSteps = (answer: string) =>
  new RegExp(`\\sin\\s${CELL}\\b`).test(answer) || /^(copy|type|insert|delete|right-click|select|press)\b/i.test(answer.trim());

// The steps for a task's answer, or null if the answer can't be read as steps
export function planAnswer(task: ExcelTask): Step[] | null {
  const formatting: Step[] = [
    ...(task.number_format && task.cell ? [{ kind: "number-format" as const, range: task.cell, pattern: task.number_format }] : []),
    ...(task.font_color && task.cell ? [{ kind: "font-color" as const, range: task.cell, colour: "#0000FF" }] : []),
    ...(task.conditional_format ? [{ kind: "conditional-format" as const, rule: task.conditional_format }] : []),
    ...(task.hidden_rows ? [{ kind: "hidden-rows" as const, rows: task.hidden_rows }] : []),
    ...(task.hidden_columns ? [{ kind: "hidden-columns" as const, columns: task.hidden_columns }] : []),
    ...(task.frozen ? [{ kind: "freeze" as const, ...task.frozen }] : []),
    ...(task.validation ? [{ kind: "validation" as const, rule: task.validation }] : []),
    ...(task.table ? [{ kind: "table" as const, ...task.table }] : []),
  ];
  if (formatting.length === 0) return typedSteps(task, false);
  return [...(typedSteps(task, true) ?? []), ...formatting];
}

// `wordsOk`: clauses that aren't steps are explanation, not a reason to give up
function typedSteps(task: ExcelTask, wordsOk: boolean): Step[] | null {
  const answer = task.answer?.trim();
  if (!answer) return null;
  if (!wordsOk && task.cell && CELL_RE.test(task.cell) && !looksLikeSteps(answer)) {
    const words = !answer.startsWith("=") && task.expected !== undefined && !Array.isArray(task.expected) && !matches(answer, task.expected);
    return words ? null : [{ kind: "set", cell: task.cell, value: answer }];
  }
  // A spill task's formula on its own goes in the top-left cell only
  if (task.spill && task.cell && answer.startsWith("=") && !looksLikeSteps(answer)) return [{ kind: "set", cell: cellsIn(task.cell)[0], value: answer }];

  const steps: Step[] = [];
  let lastSet: string | null = null; // the last cell typed into
  let clipboard: string | null = null;
  let target: string | null = null; // the last range selected
  let rightClicked: { kind: "row"; row: number } | { kind: "col"; col: string } | null = null;

  for (const clause of clauses(answer)) {
    let m: RegExpMatchArray | null;
    if ((m = clause.match(new RegExp(`^copy\\s+${CELL}$`, "i")))) clipboard = m[1];
    else if ((m = clause.match(new RegExp(`^select\\s+${RANGE}$`, "i")))) target = m[1];
    else if (/^paste$/i.test(clause)) {
      if (!clipboard || !target) return null;
      steps.push({ kind: "copy", from: clipboard, to: target });
    } else if ((m = clause.match(new RegExp(`^(?:copy|fill|filled)(?:\\s+(?:it|${RANGE}))?\\s+down\\s+to\\s+(?:row\\s+(\\d+)|${CELL})$`, "i")))) {
      const from = m[1] ?? lastSet;
      if (!from) return null;
      const lastRow = m[2] ? Number(m[2]) : parseCell(m[3]).row + 1;
      // Each cell of the range's top row is copied down its own column
      const top = parseCell(from.split(":")[0]).row;
      for (const cell of cellsIn(from).filter((c) => parseCell(c).row === top))
        steps.push({ kind: "copy", from: cell, to: `${cell}:${cellName(parseCell(cell).col, lastRow - 1)}` });
    } else if ((m = clause.match(new RegExp(`^copy\\s+${CELL}\\s+(?:across\\s+)?to\\s+${RANGE}$`, "i"))))
      steps.push({ kind: "copy", from: m[1], to: m[2] });
    else if ((m = clause.match(new RegExp(`^(?:copy|copied|fill|filled)(?:\\s+it)?\\s+(?:across\\s+)?to\\s+${CELL}$`, "i")))) {
      if (!lastSet) return null;
      steps.push({ kind: "copy", from: lastSet, to: `${lastSet}:${m[1]}` });
    } else if ((m = clause.match(new RegExp(`^(?:type\\s+)?(.+?)\\s+in\\s+${CELL}\\s+(?:copied|filled)\\s+(?:(?:across|down)\\s+)?to\\s+${CELL}$`, "i")))) {
      steps.push({ kind: "set", cell: m[2], value: m[1] }, { kind: "copy", from: m[2], to: `${m[2]}:${m[3]}` });
      lastSet = m[2];
    } else if ((m = clause.match(/^right-click (?:the )?row (\d+)(?:'s number)?$/i))) rightClicked = { kind: "row", row: Number(m[1]) };
    else if ((m = clause.match(/^right-click (?:the )?column ([A-Z]{1,3})(?:'s letter)?$/i))) rightClicked = { kind: "col", col: m[1] };
    else if ((m = clause.match(/^(insert|delete)$/i))) {
      if (!rightClicked) return null;
      const insert = m[1].toLowerCase() === "insert";
      steps.push(
        rightClicked.kind === "row"
          ? { kind: insert ? "insert-row" : "delete-row", row: rightClicked.row }
          : { kind: insert ? "insert-col" : "delete-col", col: rightClicked.col }
      );
    } else if ((m = clause.match(/^insert an? (row|column) at ([A-Z]{1,3}|\d+)$/i)))
      steps.push(m[1].toLowerCase() === "row" ? { kind: "insert-row", row: Number(m[2]) } : { kind: "insert-col", col: m[2] });
    else if ((m = clause.match(/^delete (row|column) ([A-Z]{1,3}|\d+)$/i)))
      steps.push(m[1].toLowerCase() === "row" ? { kind: "delete-row", row: Number(m[2]) } : { kind: "delete-col", col: m[2] });
    else if (/^press (ctrl|cmd|⌘)\s*\+\s*z\b/i.test(clause) || /^(press )?undo$/i.test(clause)) steps.push({ kind: "undo" });
    else if (
      (m = clause.match(new RegExp(`^(?:type\\s+)?(.+?)\\s+in\\s+${CELL}$`, "i"))) &&
      // among plain words, "Click Percent in B2" isn't typing: only "Type ..." or a formula or number is
      (!wordsOk || /^type\s/i.test(clause) || /^(=|-?\d)/.test(m[1]))
    ) {
      steps.push({ kind: "set", cell: m[2], value: m[1] });
      lastSet = m[2];
    } else if (/^(press\s+)?(tab|enter)$/i.test(clause) || /\bkeeps\b/i.test(clause) || wordsOk) continue;
    else return null;
  }
  return steps.length > 0 ? steps : null;
}

// What the learner may change during a task: its cells, plus any cells its answer types or
// pastes into, and inserting or deleting rows and columns only when the answer does that
export function taskRules(task: ExcelTask): { cells: Set<string>; structure: boolean } {
  const cells = new Set(task.cell ? cellsIn(task.cell) : []);
  let structure = false;
  for (const step of planAnswer(task) ?? []) {
    if (step.kind === "set") cells.add(step.cell);
    else if (step.kind === "copy") cellsIn(step.to).forEach((c) => cells.add(c));
    else if (step.kind === "number-format" || step.kind === "font-color") cellsIn(step.range).forEach((c) => cells.add(c));
    else if (STRUCTURE_STEPS.has(step.kind)) structure = true;
  }
  return { cells, structure };
}
