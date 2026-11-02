// Server only: reads lesson and dataset files from lib/learn/<language>/.
// Adding a lesson = adding a JSON file to the lessons folder; no code changes.
// Lessons are ordered by the number in the file name (lesson-2 comes before lesson-10).
// The reads are synchronous on purpose: Next.js then builds these pages ahead of time.

import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import {
  ExcelLessonSchema,
  LessonSchema,
  NotebookLessonSchema,
  PythonLessonSchema,
  type ExcelLesson,
  type Lesson,
  type LessonSummary,
  type NotebookLesson,
  type PythonLesson,
} from "./lesson-types";
import { PYTHON_VIEW } from "./languages";

const learnDir = (language: string) => path.join(process.cwd(), "lib", "learn", language);

// "lesson-03.json" → 3 (files without a number go last)
const lessonNumber = (file: string) => Number(file.match(/\d+/)?.[0] ?? Infinity);

// Reads every lesson file in a language's lessons folder and checks it against `schema`.
// `skipEmpty`: empty files are lessons not written yet, so they're left out instead of breaking the build.
function readLessons<T>(language: string, schema: z.ZodType<T>, { skipEmpty = false } = {}): T[] {
  const dir = path.join(learnDir(language), "lessons");
  if (!existsSync(dir)) return [];
  const files = readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .sort((a, b) => lessonNumber(a) - lessonNumber(b) || a.localeCompare(b));

  return files.flatMap((file) => {
    const text = readFileSync(path.join(dir, file), "utf8");
    if (skipEmpty && !text.trim()) return [];
    const parsed = schema.safeParse(JSON.parse(text));
    if (!parsed.success) {
      throw new Error(`Lesson file ${language}/lessons/${file} doesn't match the lesson format: ${parsed.error.message}`);
    }
    return parsed.data;
  });
}

export function getLessons(language: string): Lesson[] {
  return readLessons(language, LessonSchema);
}

// Excel lessons (lib/learn/excel/lessons/)
export function getExcelLessons(): ExcelLesson[] {
  return readLessons("excel", ExcelLessonSchema, { skipEmpty: true });
}

// One Python lesson file. A file with a mistake doesn't stop the course: it gets `problem`
// (shown on its lesson page and in the lesson list) and `lesson` is null.
export type PythonLessonEntry = LessonSummary & { lesson: PythonLesson | null };
export type NotebookLessonEntry = LessonSummary & { lesson: NotebookLesson | null };

// Python lessons are numbered by their file name (lesson-19.json is Lesson 19), so a gap in
// the files doesn't renumber the lessons after it
export function getPythonLessons(): PythonLessonEntry[] {
  return readPythonFolder("lessons", PythonLessonSchema);
}

// The notebook view's lessons (lib/learn/python/notebook/)
export function getNotebookLessons(): NotebookLessonEntry[] {
  return readPythonFolder("notebook", NotebookLessonSchema);
}

function readPythonFolder<T extends { id: string; title: string; level: number }>(
  folder: string,
  schema: z.ZodType<T>
): (LessonSummary & { lesson: T | null })[] {
  const dir = path.join(learnDir("python"), folder);
  if (!existsSync(dir)) return [];
  const files = readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .sort((a, b) => lessonNumber(a) - lessonNumber(b) || a.localeCompare(b));

  return files.map((file, index) => {
    const number = Number.isFinite(lessonNumber(file)) ? lessonNumber(file) : index;
    let data: unknown;
    try {
      data = JSON.parse(readFileSync(path.join(dir, file), "utf8"));
    } catch (err) {
      return broken(folder, file, number, null, `This file isn't valid JSON: ${err instanceof Error ? err.message : err}`);
    }
    const parsed = schema.safeParse(data);
    if (!parsed.success) return broken(folder, file, number, data, z.prettifyError(parsed.error));
    const lesson = parsed.data;
    return { id: lesson.id, number, title: lesson.title, level: lesson.level, lesson };
  });
}

function broken(folder: string, file: string, number: number, data: unknown, problem: string) {
  const d = (data ?? {}) as { id?: unknown; title?: unknown; level?: unknown };
  const message = `python/${folder}/${file} doesn't match the lesson format:\n${problem}`;
  console.error(message); // also shows in the build log
  return {
    id: typeof d.id === "string" ? d.id : file.replace(/\.json$/, ""),
    number,
    title: typeof d.title === "string" ? d.title : file,
    level: typeof d.level === "number" ? d.level : 0,
    problem: message,
    lesson: null,
  };
}

// Just the lesson-list details of a Python lesson
export const pythonSummary = ({ id, number, title, level, problem }: LessonSummary): LessonSummary => ({
  id,
  number,
  title,
  level,
  ...(problem && { problem }),
});

// The lesson list for any language
export function getLessonSummaries(language: string): LessonSummary[] {
  if (language === "python") {
    return (PYTHON_VIEW === "notebook" ? getNotebookLessons() : getPythonLessons()).map(pythonSummary);
  }
  if (language === "excel") return summarize(getExcelLessons());
  return summarize(getLessons(language));
}

export function summarize(lessons: { id: string; title: string; level: number }[]): LessonSummary[] {
  return lessons.map((l, number) => ({ id: l.id, number, title: l.title, level: l.level }));
}

// The setup code for a lesson's tables: table "games" comes from datasets/games.sql
export function getDatasetSql(language: string, tables: string[]): string {
  return tables
    .map((t) => readFileSync(path.join(learnDir(language), "datasets", `${t}.sql`), "utf8"))
    .join("\n");
}

// Python lessons: the CSV files, by name ("games" → the text of datasets/games.csv)
export function getDatasetCsv(names: string[]): Record<string, string> {
  return Object.fromEntries(
    names.map((name) => [name, readFileSync(path.join(learnDir("python"), "datasets", `${name}.csv`), "utf8")])
  );
}
