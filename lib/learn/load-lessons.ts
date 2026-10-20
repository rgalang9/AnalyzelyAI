// Server only: reads lesson and dataset files from lib/learn/<language>/.
// Adding a lesson = adding a JSON file to the lessons folder; no code changes.
// Lessons are ordered by the number in the file name (lesson-2 comes before lesson-10).
// The reads are synchronous on purpose: Next.js then builds these pages ahead of time.

import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { LessonSchema, type Lesson, type LessonSummary } from "./lesson-types";

const learnDir = (language: string) => path.join(process.cwd(), "lib", "learn", language);

// "lesson-03.json" → 3 (files without a number go last)
const lessonNumber = (file: string) => Number(file.match(/\d+/)?.[0] ?? Infinity);

export function getLessons(language: string): Lesson[] {
  const dir = path.join(learnDir(language), "lessons");
  if (!existsSync(dir)) return [];
  const files = readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .sort((a, b) => lessonNumber(a) - lessonNumber(b) || a.localeCompare(b));

  return files.map((file) => {
    const parsed = LessonSchema.safeParse(JSON.parse(readFileSync(path.join(dir, file), "utf8")));
    if (!parsed.success) {
      throw new Error(`Lesson file ${language}/lessons/${file} doesn't match the lesson format: ${parsed.error.message}`);
    }
    return parsed.data;
  });
}

export function summarize(lessons: Lesson[]): LessonSummary[] {
  return lessons.map((l, number) => ({ id: l.id, number, title: l.title, level: l.level }));
}

// The setup code for a lesson's tables: table "games" comes from datasets/games.sql
export function getDatasetSql(language: string, tables: string[]): string {
  return tables
    .map((t) => readFileSync(path.join(learnDir(language), "datasets", `${t}.sql`), "utf8"))
    .join("\n");
}
