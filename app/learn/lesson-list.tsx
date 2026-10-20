"use client";

import Link from "next/link";
import type { LessonSummary } from "@/lib/learn/lesson-types";
import { useLearnProgress } from "./progress-context";

// Every lesson in order. A lesson unlocks when the one before it is finished.
export default function LessonList({ language, lessons }: { language: string; lessons: LessonSummary[] }) {
  const { completed } = useLearnProgress();

  return (
    <>
      <p className="mt-2 text-zinc-600 dark:text-zinc-400">
        Work through the lessons in order. Each one unlocks the next.
      </p>
      <ol className="mt-8 flex flex-col gap-2">
        {lessons.map((lesson, i) => {
          const done = completed.has(lesson.id);
          const unlocked = i === 0 || completed.has(lessons[i - 1].id);
          const content = (
            <>
              <span
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${
                  done
                    ? "bg-green-600 text-white"
                    : unlocked
                      ? "bg-foreground text-background"
                      : "bg-zinc-100 text-zinc-400 dark:bg-zinc-900"
                }`}
              >
                {done ? "✓" : unlocked ? lesson.number : "🔒"}
              </span>
              <span className="min-w-0">
                <span className="block text-xs text-zinc-500">
                  Lesson {lesson.number} · Level {lesson.level}
                </span>
                <span className="block font-medium">{lesson.title}</span>
              </span>
              {!unlocked && <span className="ml-auto text-xs text-zinc-400">Finish the previous lesson to unlock</span>}
            </>
          );

          return (
            <li key={lesson.id}>
              {unlocked ? (
                <Link
                  href={`/learn/${language}/${lesson.id}`}
                  className="flex items-center gap-4 rounded-2xl border border-zinc-200 p-4 transition-colors hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-900"
                >
                  {content}
                </Link>
              ) : (
                <div
                  aria-disabled="true"
                  className="flex cursor-not-allowed items-center gap-4 rounded-2xl border border-zinc-200 p-4 opacity-60 dark:border-zinc-800"
                >
                  {content}
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </>
  );
}
