"use client";

import { useState } from "react";
import Link from "next/link";
import { Lock } from "lucide-react";
import type { LessonSummary } from "@/lib/learn/lesson-types";
import { canOpenLevel } from "@/lib/plans";
import UpgradePopup from "../upgrade-popup";
import { useUserPlan } from "../use-user-plan";
import { useLearnProgress } from "./progress-context";

// Every lesson, always in view beside the lesson: done ✓, current (highlighted), open, or locked.
// Lessons the plan doesn't include open the plans pop-up, so they stay on this lesson.
// On phones it folds into a "Lessons" box above the lesson.
export default function LessonSidebar({
  language,
  lessons,
  currentId,
}: {
  language: string;
  lessons: LessonSummary[];
  currentId: string;
}) {
  const { completed } = useLearnProgress();
  const { planId, loading } = useUserPlan();
  const [showPlans, setShowPlans] = useState(false);
  const doneCount = lessons.filter((l) => completed.has(l.id)).length;

  const list = (
    <ol className="flex flex-col gap-0.5">
      {lessons.map((lesson, i) => {
        const done = completed.has(lesson.id);
        const unlocked = i === 0 || completed.has(lessons[i - 1].id);
        const current = lesson.id === currentId;
        const paywalled = !loading && !current && !canOpenLevel(planId, lesson.level);
        const row = (
          <>
            <span
              className={`flex size-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ${
                paywalled
                  ? "bg-purple-light text-purple"
                  : done
                    ? "bg-green-600 text-white"
                    : current
                      ? "bg-purple text-white"
                      : "bg-zinc-100 text-zinc-500"
              }`}
            >
              {paywalled ? <Lock aria-label="Locked" className="size-3" /> : done ? "✓" : unlocked ? lesson.number : "🔒"}
            </span>
            <span className="min-w-0 truncate">{lesson.title}</span>
            {paywalled && (
              <span className="ml-auto rounded-full bg-purple-light px-1.5 text-[10px] font-bold text-purple">Pro</span>
            )}
          </>
        );
        const rowClass = `flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm ${
          current ? "bg-purple-light font-semibold text-navy" : ""
        }`;
        return (
          <li key={lesson.id}>
            {paywalled ? (
              <button
                type="button"
                onClick={() => setShowPlans(true)}
                className={`${rowClass} w-full text-left hover:bg-zinc-100`}
              >
                {row}
              </button>
            ) : unlocked && !current ? (
              <Link href={`/learn/${language}/${lesson.id}`} className={`${rowClass} hover:bg-zinc-100`}>
                {row}
              </Link>
            ) : (
              <span
                aria-current={current ? "page" : undefined}
                aria-disabled={!unlocked || undefined}
                className={`${rowClass} ${unlocked ? "" : "cursor-not-allowed text-zinc-400"}`}
              >
                {row}
              </span>
            )}
          </li>
        );
      })}
    </ol>
  );

  const progress = (
    <div className="px-2">
      <p className="text-xs text-zinc-500">
        {doneCount} of {lessons.length} lessons done
      </p>
      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-zinc-100">
        <div className="h-full rounded-full bg-purple" style={{ width: `${(doneCount / Math.max(1, lessons.length)) * 100}%` }} />
      </div>
    </div>
  );

  return (
    <nav aria-label="Lessons" className="rounded-2xl border border-zinc-200 p-2">
      {/* Phones: folded away */}
      <details className="lg:hidden">
        <summary className="cursor-pointer px-2 py-1.5 text-sm font-semibold">Lessons</summary>
        <div className="mt-2 flex flex-col gap-3">
          {progress}
          {list}
        </div>
      </details>
      {/* Laptops: always open */}
      <div className="hidden flex-col gap-3 lg:flex">
        <p className="px-2 pt-1 text-sm font-semibold">Lessons</p>
        {progress}
        {list}
      </div>
      {showPlans && <UpgradePopup currentPlan={planId} onClose={() => setShowPlans(false)} />}
    </nav>
  );
}
