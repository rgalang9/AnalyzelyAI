// Server only: reads lesson and dataset files from lib/learn/<language>/.
// Adding a lesson = adding a JSON file to the lessons folder; no code changes.
// Lessons are ordered by the number in the file name (lesson-2 comes before lesson-10).
// The reads are synchronous on purpose: Next.js then builds these pages ahead of time.

import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { LessonSchema, PythonLessonSchema, type Lesson, type LessonSummary, type PythonLesson } from "./lesson-types";

const learnDir = (language: string) => path.join(process.cwd(), "lib", "learn", language);

// "lesson-03.json" → 3 (files without a number go last)
const lessonNumber = (file: string) => Number(file.match(/\d+/)?.[0] ?? Infinity);

// Reads every lesson file in a language's lessons folder and checks it against `schema`
function readLessons<T>(language: string, schema: z.ZodType<T>): T[] {
  const dir = path.join(learnDir(language), "lessons");
  if (!existsSync(dir)) return [];
  const files = readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .sort((a, b) => lessonNumber(a) - lessonNumber(b) || a.localeCompare(b));

  return files.map((file) => {
    const parsed = schema.safeParse(JSON.parse(readFileSync(path.join(dir, file), "utf8")));
    if (!parsed.success) {
      throw new Error(`Lesson file ${language}/lessons/${file} doesn't match the lesson format: ${parsed.error.message}`);
    }
    return parsed.data;
  });
}

export function getLessons(language: string): Lesson[] {
  return readLessons(language, LessonSchema);
}

// One Python lesson file. A file with a mistake doesn't stop the course: it gets `problem`
// (shown on its lesson page and in the lesson list) and `lesson` is null.
export type PythonLessonEntry = LessonSummary & { lesson: PythonLesson | null };

// Python lessons are numbered by their file name (lesson-19.json is Lesson 19), so a gap in
// the files doesn't renumber the lessons after it
export function getPythonLessons(): PythonLessonEntry[] {
  const dir = path.join(learnDir("python"), "lessons");
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
      return broken(file, number, null, `This file isn't valid JSON: ${err instanceof Error ? err.message : err}`);
    }
    const parsed = PythonLessonSchema.safeParse(data);
    if (!parsed.success) return broken(file, number, data, z.prettifyError(parsed.error));
    const lesson = parsed.data;
    return { id: lesson.id, number, title: lesson.title, level: lesson.level, lesson };
  });
}

function broken(file: string, number: number, data: unknown, problem: string): PythonLessonEntry {
  const d = (data ?? {}) as { id?: unknown; title?: unknown; level?: unknown };
  const message = `python/lessons/${file} doesn't match the lesson format:\n${problem}`;
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
export const pythonSummary = ({ id, number, title, level, problem }: PythonLessonEntry): LessonSummary => ({
  id,
  number,
  title,
  level,
  ...(problem && { problem }),
});

// The lesson list for any language
export function getLessonSummaries(language: string): LessonSummary[] {
  if (language === "python") return getPythonLessons().map(pythonSummary);
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
