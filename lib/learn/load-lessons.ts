// Server only: reads lesson and dataset files from lib/learn/<language>/.
// Adding a lesson = adding a JSON file to the lessons folder; no code changes.
// Lessons are ordered by the number in the file name (lesson-2 comes before lesson-10).
// The reads are synchronous on purpose: Next.js then builds these pages ahead of time.

import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import type { z } from "zod";
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

export function getPythonLessons(): PythonLesson[] {
  return readLessons("python", PythonLessonSchema);
}

// The lesson list for any language
export function getLessonSummaries(language: string): LessonSummary[] {
  return summarize(language === "python" ? getPythonLessons() : getLessons(language));
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
