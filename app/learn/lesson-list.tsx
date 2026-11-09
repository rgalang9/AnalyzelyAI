"use client";

import { useState } from "react";
import Link from "next/link";
import { Lock } from "lucide-react";
import type { LessonSummary } from "@/lib/learn/lesson-types";
import { canOpenLevel } from "@/lib/plans";
import UpgradePopup from "../upgrade-popup";
import { useUserPlan } from "../use-user-plan";
import No7Badge, { isNo7Lesson } from "./no7-badge";
import { useLearnProgress } from "./progress-context";

// Every lesson in order. A lesson unlocks when the one before it is finished.
// Lessons the plan doesn't include show a Pro tag and open the plans pop-up. That comes first:
// the order lock doesn't matter until they have the plan.
export default function LessonList({ language, lessons }: { language: string; lessons: LessonSummary[] }) {
  const { completed } = useLearnProgress();
  const { planId, loading } = useUserPlan();
  const [showPlans, setShowPlans] = useState(false);

  return (
    <>
      <p className="mt-2 text-zinc-600">
        Work through the lessons in order. Each one unlocks the next.
      </p>
      <ol className="mt-8 flex flex-col gap-2">
        {lessons.map((lesson, i) => {
          const done = completed.has(lesson.id);
          const unlocked = i === 0 || completed.has(lessons[i - 1].id);
          const paywalled = !loading && !canOpenLevel(planId, lesson.level);
          // Lesson 7: gold badge in every state (full colour even when locked, with a small lock on it)
          const no7 = isNo7Lesson(lesson.id);
          const orderLocked = !paywalled && !unlocked;
          // A locked card is faded. On Lesson 7 only the words fade, so the badge keeps its colour.
          const fadeText = no7 && orderLocked ? "opacity-60" : "";
          const content = (
            <>
              {no7 ? (
                <No7Badge corner={paywalled || orderLocked ? "locked" : done ? "done" : undefined} />
              ) : (
                <span
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${
                    paywalled
                      ? "bg-purple-light text-purple"
                      : done
                        ? "bg-green-600 text-white"
                        : unlocked
                          ? "bg-foreground text-background"
                          : "bg-zinc-100 text-zinc-400"
                  }`}
                >
                  {paywalled ? <Lock aria-label="Locked" className="size-4" /> : done ? "✓" : unlocked ? lesson.number : "🔒"}
                </span>
              )}
              <span className={`min-w-0 ${fadeText}`}>
                <span className="block text-xs text-zinc-500">
                  Lesson {lesson.number} · Level {lesson.level}
                </span>
                <span className="flex flex-wrap items-center gap-x-2 gap-y-1 font-medium">
                  {lesson.title}
                  {no7 && (
                    <span className="rounded-full border border-gold bg-white px-2 py-0.5 text-[11px] font-bold leading-none text-[#8a6200]">
                      No. 7
                    </span>
                  )}
                </span>
                {lesson.problem && (
                  <span className="block text-xs text-amber-700">⚠ This lesson file has a problem, so it can&rsquo;t open yet.</span>
                )}
              </span>
              {paywalled ? (
                <span className="ml-auto rounded-full bg-purple-light px-2.5 py-0.5 text-xs font-bold text-purple">Pro</span>
              ) : (
                !unlocked && <span className={`ml-auto text-xs text-zinc-400 ${fadeText}`}>Finish the previous lesson to unlock</span>
              )}
            </>
          );
          const cardLook = no7 ? "border-gold bg-gold-light" : "border-zinc-200";
          const cardHover = no7 ? "hover:bg-amber-50" : "hover:bg-zinc-50";

          return (
            <li key={lesson.id}>
              {paywalled ? (
                <button
                  type="button"
                  onClick={() => setShowPlans(true)}
                  className={`flex w-full items-center gap-4 rounded-2xl border ${cardLook} p-4 text-left transition-colors ${cardHover}`}
                >
                  {content}
                </button>
              ) : unlocked ? (
                <Link
                  href={`/learn/${language}/${lesson.id}`}
                  className={`flex items-center gap-4 rounded-2xl border ${cardLook} p-4 transition-colors ${cardHover}`}
                >
                  {content}
                </Link>
              ) : (
                <div
                  aria-disabled="true"
                  className={`flex cursor-not-allowed items-center gap-4 rounded-2xl border ${cardLook} p-4 ${no7 ? "" : "opacity-60"}`}
                >
                  {content}
                </div>
              )}
            </li>
          );
        })}
      </ol>
      {showPlans && <UpgradePopup currentPlan={planId} onClose={() => setShowPlans(false)} />}
    </>
  );
}
