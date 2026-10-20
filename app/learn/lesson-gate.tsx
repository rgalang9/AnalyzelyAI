"use client";

import Link from "next/link";
import type { LessonSummary } from "@/lib/learn/lesson-types";
import { useIsUnlocked } from "./progress-context";

// No skipping: a lesson only opens once the lesson before it is finished
export default function LessonGate({
  language,
  previous,
  children,
}: {
  language: string;
  previous: LessonSummary | null;
  children: React.ReactNode;
}) {
  const unlocked = useIsUnlocked(previous?.id ?? null);
  if (unlocked) return children;

  return (
    <div className="mt-8 rounded-2xl border border-zinc-200 p-6 dark:border-zinc-800">
      <p className="font-medium">🔒 This lesson is still locked.</p>
      <p className="mt-1 text-zinc-600 dark:text-zinc-400">
        Finish Lesson {previous!.number} ({previous!.title}) first, and this one opens up.
      </p>
      <Link
        href={`/learn/${language}/${previous!.id}`}
        className="mt-4 inline-block rounded-full bg-foreground px-5 py-2.5 text-sm font-medium text-background hover:opacity-80"
      >
        Go to Lesson {previous!.number}
      </Link>
    </div>
  );
}
