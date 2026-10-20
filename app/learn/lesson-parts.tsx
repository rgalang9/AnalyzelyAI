"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import type { CodeLine } from "@/lib/learn/lesson-types";
import type { QueryResult } from "@/lib/learn/sql/runner";
import CodeLines from "./code-lines";
import ResultsGrid from "./results-grid";

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
          ? "bg-green-50 text-green-900 dark:bg-green-950/50 dark:text-green-200"
          : "bg-amber-50 text-amber-900 dark:bg-amber-950/50 dark:text-amber-200"
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
      <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
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
  onClose,
}: {
  name: string;
  data: QueryResult;
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
      <div className="mt-4 h-[60vh] overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-800">
        <ResultsGrid result={data} />
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
  nextLesson: { id: string; number: number; title: string } | null;
}) {
  return (
    <div className="rounded-2xl border border-green-200 bg-green-50 p-5 dark:border-green-900 dark:bg-green-950/40">
      <p className="text-lg font-semibold">Lesson complete! 🎉</p>
      <p className="mt-2 leading-7">{recap}</p>
      <div className="mt-4 flex flex-wrap gap-2">
        {nextLesson && (
          <Link
            href={`/learn/${language}/${nextLesson.id}`}
            className="rounded-full bg-foreground px-5 py-2.5 text-sm font-medium text-background hover:opacity-80"
          >
            Next: Lesson {nextLesson.number} · {nextLesson.title} →
          </Link>
        )}
        <Link
          href={`/learn/${language}`}
          className="rounded-full border border-zinc-300 px-5 py-2.5 text-sm font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
        >
          All lessons
        </Link>
      </div>
    </div>
  );
}
