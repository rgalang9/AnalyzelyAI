import { z } from "zod";

// The shape of a lesson file (lib/learn/<language>/lessons/*.json).
// This only checks the files; it never changes them. A file that doesn't match
// shows a clear error naming the file, instead of breaking the lesson page.

const CodeLineSchema = z.object({ line: z.string(), explain: z.string() });

const WriteTaskSchema = z.object({
  type: z.literal("write"),
  prompt: z.string(),
  answer: z.string(), // the query whose result the learner's result must match
  hints: z.array(z.string()),
  solution_lines: z.array(CodeLineSchema),
});

const PredictTaskSchema = z.object({
  type: z.literal("predict"),
  prompt: z.string(),
  code: z.string(),
  options: z.array(z.string()),
  answer: z.string(), // the correct option
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

// What the lesson list needs to know about each lesson
export type LessonSummary = { id: string; number: number; title: string; level: number };
