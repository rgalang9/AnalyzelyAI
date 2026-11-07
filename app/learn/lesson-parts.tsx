"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Lock } from "lucide-react";
import type { CodeLine } from "@/lib/learn/lesson-types";
import type { QueryResult } from "@/lib/learn/sql/runner";
import { canOpenLevel } from "@/lib/plans";
import UpgradePopup from "../upgrade-popup";
import { useUserPlan } from "../use-user-plan";
import CodeLines from "./code-lines";
import ResultsGrid, { type GridExtras } from "./results-grid";

// Small pieces shared by every kind of lesson

// How long feedback waits before a hint appears, so answers can't be spammed
export const HINT_PAUSE_MS = 2000;

// Friendly openers for a not-quite-right answer (never "Wrong!")
const NUDGES = ["Not quite yet, but you're close!", "Good try! Let's tweak it.", "Almost there!", "Nice effort! One more go."];
export const nudge = (attempt: number) => NUDGES[(attempt - 1) % NUDGES.length];

export function Feedback({ tone, children }: { tone: "good" | "try"; children: React.ReactNode }) {
  return (
    <div
      role="status"
      className={`rounded-xl px-4 py-3 text-sm ${
        tone === "good"
          ? "bg-green-50 text-green-900"
          : "bg-amber-50 text-amber-900"
      }`}
    >
      {children}
    </div>
  );
}

// The 3rd-try pop-up: the solution with hover explanations, to read then type yourself
export function SolutionModal({ lines, onClose }: { lines: CodeLine[]; onClose: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    dialogRef.current?.showModal();
  }, []);

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      className="m-auto w-[calc(100%-2rem)] max-w-lg rounded-2xl bg-background p-6 text-foreground shadow-xl backdrop:bg-black/40"
    >
      <h2 className="text-xl font-bold tracking-tight">Here&rsquo;s one way to do it 💡</h2>
      <p className="mt-1 text-sm text-zinc-600">
        Hover over each line to see what it does. Then close this and type it in yourself.
      </p>
      <div className="mt-4">
        <CodeLines lines={lines} />
      </div>
      <button
        type="button"
        onClick={() => dialogRef.current?.close()}
        className="mt-5 w-full rounded-full bg-foreground px-6 py-3 font-medium text-background transition-opacity hover:opacity-80"
      >
        Got it, I&rsquo;ll type it myself
      </button>
    </dialog>
  );
}

// Pop-up showing every row and column of one table
export function TablePreviewModal({
  name,
  data,
  grid,
  onClose,
}: {
  name: string;
  data: QueryResult;
  grid?: GridExtras; // e.g. pandas' row labels
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    dialogRef.current?.showModal();
  }, []);

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      className="m-auto w-[calc(100%-2rem)] max-w-5xl rounded-2xl bg-background p-6 text-foreground shadow-xl backdrop:bg-black/40"
    >
      <h2 className="font-mono text-lg font-semibold">▦ {name}</h2>
      <div className="mt-4 h-[60vh] overflow-hidden rounded-xl border border-zinc-200">
        <ResultsGrid result={data} {...grid} />
      </div>
      <button
        type="button"
        onClick={() => dialogRef.current?.close()}
        className="mt-5 rounded-full bg-foreground px-6 py-2.5 font-medium text-background transition-opacity hover:opacity-80"
      >
        Close
      </button>
    </dialog>
  );
}

// End of a lesson: the recap, and the next lesson (now unlocked)
export function LessonDone({
  recap,
  language,
  nextLesson,
}: {
  recap: string;
  language: string;
  nextLesson: { id: string; number: number; title: string; level: number } | null;
}) {
  const { planId, loading } = useUserPlan();
  const [showPlans, setShowPlans] = useState(false);
  const [closedPlans, setClosedPlans] = useState(false); // they saw the plans and closed them
  // Still loading the plan? Let the link work: the lesson page checks on the server anyway
  const needsUpgrade = nextLesson !== null && !loading && !canOpenLevel(planId, nextLesson.level);

  return (
    <div className="rounded-2xl border border-green-200 bg-green-50 p-5">
      <p className="text-lg font-semibold">Lesson complete! 🎉</p>
      <p className="mt-2 leading-7">{recap}</p>
      <div className="mt-4 flex flex-wrap gap-2">
        {needsUpgrade && closedPlans ? (
          <button
            type="button"
            onClick={() => setShowPlans(true)}
            className="flex items-center gap-1.5 rounded-full bg-foreground px-5 py-2.5 text-sm font-medium text-background hover:opacity-80"
          >
            <Lock aria-hidden="true" className="size-4" />
            Locked. Upgrade to continue
          </button>
        ) : nextLesson && (
          <Link
            href={`/learn/${language}/${nextLesson.id}`}
            onClick={(event) => {
              if (!needsUpgrade) return;
              event.preventDefault();
              setShowPlans(true);
            }}
            className="rounded-full bg-foreground px-5 py-2.5 text-sm font-medium text-background hover:opacity-80"
          >
            Next: Lesson {nextLesson.number} · {nextLesson.title} →
          </Link>
        )}
        <Link
          href={`/learn/${language}`}
          className="rounded-full border border-zinc-300 px-5 py-2.5 text-sm font-medium hover:bg-zinc-100"
        >
          All lessons
        </Link>
      </div>
      {showPlans && (
        <UpgradePopup
          currentPlan={planId}
          onClose={() => {
            setShowPlans(false);
            setClosedPlans(true);
          }}
        />
      )}
    </div>
  );
}

// Just enough markdown for lesson text: paragraphs, ``` code blocks, **bold** and `code`
export function Markdown({ text }: { text: string }) {
  // Odd pieces are the insides of ``` blocks (the language name after ``` is dropped)
  const pieces = text.split(/```[^\n]*\n([\s\S]*?)\n?```/);
  return (
    <div className="flex flex-col gap-3">
      {pieces.flatMap((piece, b) =>
        b % 2 === 1
          ? [
              <pre key={b} className="overflow-x-auto rounded bg-zinc-100 px-4 py-3 font-mono text-sm leading-6">
                {piece}
              </pre>,
            ]
          : piece
              .split(/\n\s*\n/)
              .filter((paragraph) => paragraph.trim())
              .map((paragraph, p) => (
                <p key={`${b}-${p}`}>
                  {paragraph.split(/(\*\*[^*]+\*\*|`[^`]+`)/).map((part, i) =>
                    part.startsWith("**") && part.endsWith("**") ? (
                      <strong key={i}>{part.slice(2, -2)}</strong>
                    ) : part.startsWith("`") && part.endsWith("`") ? (
                      <code key={i} className="rounded bg-zinc-100 px-1 py-0.5 font-mono text-[0.9em]">
                        {part.slice(1, -1)}
                      </code>
                    ) : (
                      <Fragment key={i}>{part}</Fragment>
                    )
                  )}
                </p>
              ))
      )}
    </div>
  );
}
