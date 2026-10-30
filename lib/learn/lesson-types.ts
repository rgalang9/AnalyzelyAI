import { z } from "zod";

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
