import { z } from "zod";
import { cellsIn, RANGE_RE } from "./excel/cells";
import { keysFor, SHORTCUT_IDS } from "./excel/shortcuts";
import { EXCEL_ERRORS } from "./excel/grade";
import { AGGS, CHART_TYPES } from "./excel/insights";

// The shape of a lesson file (lib/learn/<language>/lessons/*.json).
// This only checks the files; it never changes them. A file that doesn't match
// shows a clear error naming the file, instead of breaking the lesson page.

const CodeLineSchema = z.object({ line: z.string(), explain: z.string() });

const WriteTaskSchema = z.object({
  type: z.literal("write"),
  prompt: z.string(),
  answer: z.string(), // the query whose result the learner's result must match
  // Optional SELECT for tasks that change data (INSERT/UPDATE/DELETE): it runs after the
  // learner's code and after the answer, each on fresh data, and the two results are compared
  check: z.string().optional(),
  hints: z.array(z.string()),
  solution_lines: z.array(CodeLineSchema),
});

const PredictTaskSchema = z.object({
  type: z.literal("predict"),
  prompt: z.string(),
  code: z.string(),
  options: z.array(z.string()),
  answer: z.string(), // the correct option
  check: z.string().optional(), // optional SELECT shown after running the code (for code that changes data)
  hints: z.array(z.string()),
  solution_lines: z.array(CodeLineSchema),
});

const lessonBase = {
  id: z.string(),
  level: z.number(),
  title: z.string(),
  tables: z.array(z.string()),
  explanation: z.string(),
  recap: z.string(),
};

const CodingLessonSchema = z.object({
  ...lessonBase,
  type: z.literal("lesson").optional(), // lessons without a "type" are coding lessons
  example: z.object({ code: z.string(), lines: z.array(CodeLineSchema) }),
  tasks: z.array(z.discriminatedUnion("type", [WriteTaskSchema, PredictTaskSchema])),
});

export const TOUR_TARGETS = ["table", "column_header", "row", "cell", "null_cell"] as const;

const TourLessonSchema = z.object({
  ...lessonBase,
  type: z.literal("tour"),
  tour: z.array(z.object({ target: z.enum(TOUR_TARGETS), explain: z.string() })),
  quiz: z.array(
    z.object({
      prompt: z.string(),
      // row = row number (1 = first row); rows = any of these rows; column = column name
      answer: z.object({
        row: z.number().optional(),
        rows: z.array(z.number()).optional(),
        column: z.string().optional(),
      }),
    })
  ),
});

export const LessonSchema = z.union([TourLessonSchema, CodingLessonSchema]);

export type CodeLine = z.infer<typeof CodeLineSchema>;
export type WriteTask = z.infer<typeof WriteTaskSchema>;
export type PredictTask = z.infer<typeof PredictTaskSchema>;
export type CodingLesson = z.infer<typeof CodingLessonSchema>;
export type TourLesson = z.infer<typeof TourLessonSchema>;
export type TourTarget = (typeof TOUR_TARGETS)[number];
export type QuizAnswer = TourLesson["quiz"][number]["answer"];
export type Lesson = z.infer<typeof LessonSchema>;

// What the lesson list needs to know about each lesson.
// `problem`: the lesson file has a mistake, so it shows an error instead of the lesson.
export type LessonSummary = { id: string; number: number; title: string; level: number; problem?: string };

// ---------- Python lessons (lib/learn/python/lessons/*.json) ----------
// Answers are checked by what the code produces, never by the exact code:
// "print" compares the printed text, "table" the table (DataFrame or Series) on the last line,
// "value" the value on the last line (numbers within 0.000001), "chart" the kind of chart and
// how many bars, points or lines it has.

const PyCompareSchema = z.enum(["print", "table", "value", "chart", "any_text"]); // any_text: notebook only

const pyTaskBase = {
  prompt: z.string(),
  hints: z.array(z.string()),
  solution_lines: z.array(CodeLineSchema),
};

const PyWriteTaskSchema = z.object({
  ...pyTaskBase,
  type: z.literal("write"),
  starter: z.string().optional(), // code already in the editor when the task opens
  answer: z.string(), // code whose output the learner's output must match
  compare: PyCompareSchema,
  require: z.array(z.string()).optional(), // bits the code must contain, e.g. ["price"]
});

const PyFillTaskSchema = z.object({
  ...pyTaskBase,
  type: z.literal("fill"),
  code: z.string(), // the code with ___ where each blank goes
  answer: z.string(),
  compare: PyCompareSchema,
});

const PyRunTaskSchema = z.object({
  ...pyTaskBase,
  type: z.literal("run"),
  code: z.string(), // ready-made code: the learner just runs it
  answer: z.string(),
  compare: PyCompareSchema,
});

const PyPredictTaskSchema = z.object({
  ...pyTaskBase,
  type: z.literal("predict"),
  code: z.string(),
  options: z.array(z.string()),
  answer: z.string(), // the correct option
});

export const PY_TOUR_TARGETS = ["lesson_list", "explanation", "editor", "run_button", "output", "hint_button"] as const;

export const PythonLessonSchema = z.object({
  id: z.string(),
  level: z.number(),
  title: z.string(),
  datasets: z.array(z.string()), // "games" = datasets/games.csv, readable as "games.csv"
  setup: z.string(), // runs before the learner's code (and before the answer), e.g. imports
  explanation: z.string(),
  tour: z.array(z.object({ target: z.enum(PY_TOUR_TARGETS), explain: z.string() })).optional(),
  example: z.object({ code: z.string(), lines: z.array(CodeLineSchema) }),
  tasks: z.array(
    z.discriminatedUnion("type", [PyWriteTaskSchema, PyFillTaskSchema, PyRunTaskSchema, PyPredictTaskSchema])
  ),
  recap: z.string(),
});

export type PythonLesson = z.infer<typeof PythonLessonSchema>;
export type PythonTask = PythonLesson["tasks"][number];
export type PyCompare = z.infer<typeof PyCompareSchema>;
export type PyTourTarget = (typeof PY_TOUR_TARGETS)[number];

// ---------- Python notebook lessons (lib/learn/python/notebook/*.json) ----------
// One lesson is one notebook: cells top to bottom, all sharing one Python session.

const NotebookCellSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("markdown"), text: z.string() }),
  z.object({ type: z.literal("run"), prompt: z.string().optional(), code: z.string() }),
  z.object({
    type: z.literal("predict"),
    prompt: z.string().optional(), // shown above the cell (a standard question if there isn't one)
    code: z.string(),
    options: z.array(z.string()),
    answer: z.string(), // the correct option
  }),
  z.object({
    type: z.literal("fill"),
    prompt: z.string().optional(), // shown above the cell, like write cells
    code: z.string(), // with ___ where each blank goes
    answer: z.string(),
    compare: PyCompareSchema,
    variable: z.string().optional(), // compare "any_text": this variable must end up holding some text
    hints: z.array(z.string()).default([]),
  }),
  z.object({
    type: z.literal("write"),
    prompt: z.string(),
    starter: z.string().optional(),
    answer: z.string(),
    compare: PyCompareSchema,
    require: z.array(z.string()).optional(),
    variable: z.string().optional(),
    hints: z.array(z.string()).default([]),
  }),
]);

export const NotebookLessonSchema = z.object({
  id: z.string(),
  level: z.number(),
  title: z.string(),
  datasets: z.array(z.string()),
  setup: z.string(),
  cells: z.array(NotebookCellSchema),
  recap: z.string(),
});

export type NotebookLesson = z.infer<typeof NotebookLessonSchema>;
export type NotebookCell = NotebookLesson["cells"][number];

// ---------- Excel lessons (lib/learn/excel/lessons/) ----------
// The fields are explained in lib/learn/excel/LESSON_TEMPLATE.json.

const ExcelValueSchema = z.union([z.string(), z.number(), z.boolean(), z.null()]);

const ExcelSheetSchema = z.object({
  name: z.string(),
  rows: z.array(z.array(ExcelValueSchema)), // text starting with "=" is a formula
  header: z.boolean().default(true), // first row in bold
  column_widths: z.array(z.number()).optional(), // in pixels, from column A
  // Number formats put on cells when the workbook loads, like {"B2:B6": "yyyy-mm-dd"} (empty cells too,
  // so results typed there later show in the format)
  number_formats: z.record(z.string().regex(RANGE_RE, 'Use a cell like "B8" or a range like "B2:B6" (capital letters)'), z.string().min(1)).optional(),
});

const CF_TYPES = ["greater_than", "less_than", "between", "equal_to", "text_contains", "duplicate"] as const;
const COLOUR_RE = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

// A conditional formatting rule the learner must add (Home > Conditional Formatting)
const ConditionalFormatSchema = z
  .object({
    range: z.string().regex(RANGE_RE, 'Use a range like "C2:C20" (capital letters)'),
    type: z.enum(CF_TYPES),
    value: z.union([z.number(), z.string(), z.tuple([z.number(), z.number()])]).optional(),
    fill: z.string().regex(COLOUR_RE, 'Use a colour like "#FFC7CE"').optional(),
  })
  .superRefine((cf, ctx) => {
    const problem = (message: string) => ctx.addIssue({ code: "custom", message });
    const v = cf.value;
    if (cf.type === "between" && !Array.isArray(v)) problem('A "between" rule needs a value like [10, 20].');
    if ((cf.type === "greater_than" || cf.type === "less_than") && typeof v !== "number") problem(`A "${cf.type}" rule needs a number value.`);
    if (cf.type === "equal_to" && (v === undefined || Array.isArray(v))) problem('An "equal_to" rule needs a number or text value.');
    if (cf.type === "text_contains" && typeof v !== "string") problem('A "text_contains" rule needs a text value.');
    if (cf.type === "duplicate" && v !== undefined) problem('A "duplicate" rule has no value.');
  });

// A data validation rule the learner must add (Data > Data validation)
const ValidationSchema = z.discriminatedUnion("type", [
  z.object({
    range: z.string().regex(RANGE_RE, 'Use a range like "B2:B7" (capital letters)'),
    type: z.literal("list"),
    values: z.array(z.string().min(1)).min(1),
  }),
  z
    .object({
      range: z.string().regex(RANGE_RE, 'Use a range like "D2:D7" (capital letters)'),
      type: z.literal("whole_number"),
      min: z.number().int().optional(),
      max: z.number().int().optional(),
    })
    .refine((v) => v.min !== undefined || v.max !== undefined, 'A "whole_number" rule needs a min, a max, or both.')
    .refine((v) => v.min === undefined || v.max === undefined || v.min <= v.max, "min must not be bigger than max."),
]);

// The Insights panel's pivot table and chart (only the keys given are checked)
const PivotCheckSchema = z
  .object({
    rows: z.string().nullable(),
    columns: z.string().nullable(),
    values: z.string().nullable(),
    agg: z.enum(AGGS),
    percent_of_total: z.boolean(),
    group_by_month: z.boolean(),
    slicers: z.record(z.string(), z.array(z.string()).min(1)),
  })
  .partial()
  .strict()
  .refine((p) => Object.keys(p).length > 0, "A pivot check needs at least one setting, like rows or values.");

const ChartCheckSchema = z
  .object({
    type: z.enum(CHART_TYPES),
    x: z.string().nullable(),
    y: z.string().nullable(),
    agg: z.enum(AGGS),
    line: z.string().nullable(),
    title: z.string(),
  })
  .partial()
  .strict()
  .refine((c) => Object.keys(c).length > 0, "A chart check needs at least one setting, like type or x.");

const ExcelTaskSchema = z
  .object({
    teach: z.string().optional(),
    prompt: z.string(),
    sheet: z.string().optional(),
    cell: z.string().regex(RANGE_RE, 'Use a cell like "D2" or a range like "D2:D6" (capital letters)').optional(),
    expected: z.union([ExcelValueSchema, z.array(ExcelValueSchema)]).optional(),
    must_be_formula: z.boolean().default(false),
    function: z.union([z.string(), z.array(z.string())]).optional(),
    formula_contains: z.array(z.string()).default([]),
    exact_text: z.boolean().default(false), // text must match exactly, capitals and spaces included
    spill: z.boolean().default(false), // one formula in the top-left cell of "cell" spills into the rest
    font_color: z.literal("blue").optional(), // every cell in "cell" must have a blue font (input cells, by model convention)
    keyboard_only: z.boolean().default(false), // clicking in the grid is blocked during the task
    must_be_value: z.boolean().default(false),
    number_format: z.string().min(1).optional(),
    conditional_format: ConditionalFormatSchema.optional(),
    hidden_rows: z.array(z.number().int().positive()).optional(), // row numbers as on screen; [] means none hidden
    hidden_columns: z.array(z.string().regex(/^[A-Z]{1,3}$/, 'Use column letters like "G" (capital letters)')).optional(),
    frozen: z.object({ rows: z.number().int().min(0), columns: z.number().int().min(0) }).optional(),
    validation: ValidationSchema.optional(),
    // A table (Insert Table) covering exactly this range, header row included
    table: z
      .object({
        range: z.string().regex(RANGE_RE, 'Use a range like "A1:E9" (capital letters)'),
        name: z
          .string()
          .regex(/^[A-Za-z_][A-Za-z0-9_.]*$/, "A table name starts with a letter and has no spaces, like Sales")
          .optional(),
      })
      .optional(),
    pivot: PivotCheckSchema.optional(),
    chart: ChartCheckSchema.optional(),
    selected: z.string().regex(RANGE_RE, 'Use a cell like "C4" or a range like "A1:A5" (capital letters)').optional(),
    shortcut: z.enum(SHORTCUT_IDS).optional(),
    shortcut_help: z.enum(["badge", "hint", "none"]).default("badge"),
    shortcut_required: z.boolean().default(false),
    hints: z.array(z.string()).default([]),
    highlight: z.array(z.string().regex(RANGE_RE)).default([]),
    answer: z.string().optional(),
  })
  .superRefine((t, ctx) => {
    const problem = (message: string) => ctx.addIssue({ code: "custom", message });
    const sheetCheck = t.conditional_format || t.hidden_rows || t.hidden_columns || t.frozen || t.validation || t.table || t.pivot || t.chart;
    if (!t.cell && !t.selected && !t.shortcut && !sheetCheck)
      problem(
        "A task needs a cell to check, a selection to make, a shortcut to press, or a sheet check (conditional_format, hidden_rows, hidden_columns, frozen, validation, table, pivot or chart)."
      );
    // A number format or font colour task may leave out expected: then only the format is checked
    if (t.cell && t.expected === undefined && !t.number_format && !t.font_color) problem(`Task "${t.prompt}" has a cell but no expected value.`);
    if (t.must_be_value && t.expected === undefined) problem(`Task "${t.prompt}": must_be_value needs a cell and an expected value.`);
    if (t.must_be_value && (t.must_be_formula || t.function !== undefined || t.formula_contains.length > 0))
      problem(`Task "${t.prompt}": must_be_value can't be used with must_be_formula, function or formula_contains.`);
    if (t.number_format && !t.cell) problem(`Task "${t.prompt}": number_format needs a cell (or range) to check.`);
    if (t.spill && (!t.cell || cellsIn(t.cell).length < 2 || !Array.isArray(t.expected)))
      problem(`Task "${t.prompt}": spill needs a range in "cell" (like "D2:D7") and a list of expected values.`);
    if (t.spill && t.must_be_value) problem(`Task "${t.prompt}": spill can't be used with must_be_value.`);
    if (t.font_color && !t.cell) problem(`Task "${t.prompt}": font_color needs a cell (or range) to check.`);
    if (!t.cell && t.expected !== undefined) problem(`Task "${t.prompt}" has an expected value but no cell.`);
    if (t.cell && !t.answer) problem(`Task "${t.prompt}" needs an answer (shown at the end of the help ladder).`);
    // Text starting with # is an error code the cell must show, so it has to be a real one
    for (const v of [t.expected ?? []].flat())
      if (typeof v === "string" && v.trim().startsWith("#") && !EXCEL_ERRORS.includes(v.trim().toUpperCase()))
        problem(`Task "${t.prompt}": ${v} isn't an Excel error. Use one of ${EXCEL_ERRORS.join(", ")}.`);
    if (t.cell && t.expected !== undefined) {
      const count = cellsIn(t.cell).length;
      if (count === 1 && Array.isArray(t.expected)) problem(`Task "${t.prompt}": one cell, so expected should be one value, not a list.`);
      if (count > 1 && (!Array.isArray(t.expected) || t.expected.length !== count))
        problem(`Task "${t.prompt}": ${t.cell} has ${count} cells, so expected should be a list of ${count} values, row by row.`);
    }
    // A keys-only task must be doable on both Windows and Mac
    if (t.shortcut && ((!t.cell && !t.selected) || t.shortcut_required)) {
      for (const os of ["windows", "mac"] as const) {
        if (!keysFor(t.shortcut, os).press)
          problem(`Task "${t.prompt}": the browser keeps the ${os} keys for ${t.shortcut}, so learners can't press them here.`);
      }
    }
  });

export const ExcelLessonSchema = z
  .object({
    id: z.string(),
    level: z.number(),
    title: z.string(),
    explanation: z.string(),
    workbook: z.object({ sheets: z.array(ExcelSheetSchema).min(1) }),
    tasks: z.array(ExcelTaskSchema).min(1),
    recap: z.string(),
    speed_round: z.boolean().default(false), // a running timer, and the final time at the end
  })
  .superRefine((lesson, ctx) => {
    const names = lesson.workbook.sheets.map((s) => s.name);
    for (const task of lesson.tasks) {
      if (task.sheet && !names.includes(task.sheet))
        ctx.addIssue({ code: "custom", message: `Task "${task.prompt}" uses sheet "${task.sheet}", but the workbook has: ${names.join(", ")}.` });
      // Pivot and chart fields are header names, so each must be text somewhere on the task's sheet
      const sheet = lesson.workbook.sheets.find((s) => s.name === (task.sheet ?? names[0]));
      const texts = new Set(sheet?.rows.flat().filter((v): v is string => typeof v === "string").map((v) => v.trim().toLowerCase()));
      const fields = [
        task.pivot?.rows,
        task.pivot?.columns,
        task.pivot?.values,
        ...Object.keys(task.pivot?.slicers ?? {}),
        task.chart?.x,
        task.chart?.y,
        task.chart?.line,
      ].filter((f): f is string => typeof f === "string");
      for (const f of fields)
        if (!texts.has(f.trim().toLowerCase()))
          ctx.addIssue({ code: "custom", message: `Task "${task.prompt}" uses the field "${f}", but no header on sheet "${sheet?.name}" is called that.` });
    }
  });

export type ExcelLesson = z.infer<typeof ExcelLessonSchema>;
export type ExcelTask = ExcelLesson["tasks"][number];
export type ExcelSheet = ExcelLesson["workbook"]["sheets"][number];
export type ExcelValue = z.infer<typeof ExcelValueSchema>;
export type ConditionalFormat = z.infer<typeof ConditionalFormatSchema>;
export type Validation = z.infer<typeof ValidationSchema>;
