"use client";

import { useEffect, useRef, useState } from "react";
import type { CodeLine } from "@/lib/learn/lesson-types";
import { useLearnProgress } from "./progress-context";
import CodeLines from "./code-lines";
import { Feedback, HINT_PAUSE_MS, nudge } from "./lesson-parts";

// The task flow shared by every coding lesson, whatever the language: "Got it" to start,
// one task at a time, the help ladder, predict picks, and finishing the lesson.
// Each language's lesson player only adds how code runs and how results are checked.

// Where the learner is within the current task
export type TaskState = {
  wrongTries: number;
  hintsShown: number;
  solutionOpen: boolean;
  solutionSeen: boolean;
  solved: boolean;
  wrongPicks: string[]; // predict tasks: options already tried
  feedback: { tone: "good" | "try"; text: string } | null;
};
const FRESH_TASK: TaskState = {
  wrongTries: 0,
  hintsShown: 0,
  solutionOpen: false,
  solutionSeen: false,
  solved: false,
  wrongPicks: [],
  feedback: null,
};

// `Task` is the language's own task type, so each player keeps its task fields (answer, code, …)
export function useTaskFlow<Task extends { hints: string[] }>(lesson: { id: string; tasks: Task[] }) {
  const { markComplete } = useLearnProgress();
  const [started, setStarted] = useState(false); // pressed "Got it"
  const [taskIndex, setTaskIndex] = useState(0);
  const [finished, setFinished] = useState(false);
  const [ts, setTs] = useState<TaskState>(FRESH_TASK);
  const [cooling, setCooling] = useState(false); // short pause after a wrong answer
  const timer = useRef<number | undefined>(undefined);
  const afterPause = useRef<(() => void) | null>(null); // what happens when the current pause ends

  // No hint should pop up after leaving the lesson. Next.js can hide this page and bring it back,
  // so a pause that was cut short finishes on return: otherwise Run would stay off until a reload.
  useEffect(() => {
    afterPause.current?.();
    return () => clearTimeout(timer.current);
  }, [lesson]);

  const task = lesson.tasks[taskIndex];
  const isLastTask = taskIndex === lesson.tasks.length - 1;

  // Ends the pause now, with no hint
  function cancelPause() {
    clearTimeout(timer.current);
    afterPause.current = null;
    setCooling(false);
  }

  // Show task `index` with a clean slate (no tries, hints or feedback yet)
  function goToTask(index: number) {
    cancelPause();
    setTaskIndex(index);
    setTs(FRESH_TASK);
  }

  function finishLesson() {
    setFinished(true);
    markComplete(lesson.id);
  }

  function solve(text: string) {
    cancelPause();
    setTs((s) => ({ ...s, solved: true, feedback: { tone: "good", text } }));
  }

  // Help ladder: 1st miss = hint 1, 2nd = hint 2, 3rd = solution pop-up.
  // The help appears after a short pause.
  function miss(reason: string) {
    const tries = ts.wrongTries + 1;
    const hintCount = task.hints.length;
    setTs((s) => ({ ...s, wrongTries: tries, feedback: { tone: "try", text: `${nudge(tries)} ${reason}` } }));
    setCooling(true);
    afterPause.current = () => {
      afterPause.current = null;
      setCooling(false);
      setTs((s) =>
        tries <= hintCount
          ? { ...s, hintsShown: Math.max(s.hintsShown, tries) }
          : s.solutionSeen
            ? s // they've seen it already; the "Show the example again" button is there
            : { ...s, solutionOpen: true, solutionSeen: true }
      );
    };
    clearTimeout(timer.current);
    timer.current = window.setTimeout(afterPause.current, HINT_PAUSE_MS);
  }

  // Predict tasks: remember a wrong option so it gets crossed out, then go down the help ladder
  function missPick(option: string) {
    setTs((s) => ({ ...s, wrongPicks: [...s.wrongPicks, option] }));
    miss(`It isn't ${option}.`);
  }

  // A friendly note that doesn't count as a try (e.g. "Type a query first")
  function say(text: string) {
    setTs((s) => ({ ...s, feedback: { tone: "try", text } }));
  }

  const setSolutionOpen = (open: boolean) => setTs((s) => ({ ...s, solutionOpen: open }));

  return {
    started,
    setStarted,
    taskIndex,
    task,
    isLastTask,
    finished,
    ts,
    cooling,
    goToTask,
    finishLesson,
    solve,
    miss,
    missPick,
    say,
    setSolutionOpen,
  };
}

export type TaskFlow = ReturnType<typeof useTaskFlow<{ hints: string[] }>>;

// ---------- Screen pieces for the flow ----------

// Before "Got it": the explanation, the worked example, and the button that unlocks the editor
export function LessonIntro({
  explanation,
  exampleLines,
  ready,
  onGotIt,
}: {
  explanation: string;
  exampleLines: CodeLine[];
  ready: boolean; // false while the code engine is still loading
  onGotIt: () => void;
}) {
  return (
    <>
      <p className="leading-7">{explanation}</p>
      <div>
        <h3 className="mb-2 font-semibold">Example</h3>
        <CodeLines lines={exampleLines} />
      </div>
      <button
        type="button"
        onClick={onGotIt}
        disabled={!ready}
        className="self-start rounded-full bg-foreground px-6 py-3 font-medium text-background transition-opacity hover:opacity-80 disabled:cursor-wait disabled:opacity-40"
      >
        Got it
      </button>
    </>
  );
}

// After "Got it": the explanation and example, folded away but still there to look back at
export function ExplanationRecall({ explanation, exampleLines }: { explanation: string; exampleLines: CodeLine[] }) {
  return (
    <details className="rounded-xl border border-zinc-200 px-4 py-2 text-sm">
      <summary className="cursor-pointer font-medium">Explanation and example</summary>
      <p className="mt-2 leading-6">{explanation}</p>
      <div className="my-3">
        <CodeLines lines={exampleLines} />
      </div>
    </details>
  );
}

// The answer buttons of a predict task
export function PredictOptions({
  options,
  answer,
  flow,
  onPick,
}: {
  options: string[];
  answer: string;
  flow: TaskFlow;
  onPick: (option: string) => void;
}) {
  const { ts, cooling } = flow;
  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {options.map((option) => {
        const triedWrong = ts.wrongPicks.includes(option);
        const isAnswer = ts.solved && option === answer;
        return (
          <button
            key={option}
            type="button"
            onClick={() => onPick(option)}
            disabled={ts.solved || cooling || triedWrong}
            className={`min-w-16 rounded-full border px-5 py-2 font-medium transition-colors disabled:cursor-not-allowed ${
              isAnswer
                ? "border-green-600 bg-green-50 text-green-900"
                : triedWrong
                  ? "border-zinc-200 text-zinc-400 line-through"
                  : "border-zinc-300 hover:bg-zinc-100 disabled:opacity-60"
            }`}
          >
            {option}
          </button>
        );
      })}
    </div>
  );
}

// Under the task: feedback, the "hint is on its way" pause, hints, and Next / Finish
export function TaskHelp({ flow, onNext }: { flow: TaskFlow; onNext: () => void }) {
  const { ts, cooling, task, isLastTask } = flow;
  return (
    <>
      {ts.feedback && <Feedback tone={ts.feedback.tone}>{ts.feedback.text}</Feedback>}
      {cooling && <p className="animate-pulse text-sm text-zinc-500">Have a think… a hint is on its way.</p>}

      {ts.hintsShown > 0 && !ts.solved && (
        <ul className="flex flex-col gap-2">
          {task.hints.slice(0, ts.hintsShown).map((hint, i) => (
            <li key={i} className="rounded-xl bg-blue-50 px-4 py-3 text-sm text-blue-950">
              <span className="font-semibold">💡 Hint {i + 1}: </span>
              {hint}
            </li>
          ))}
        </ul>
      )}

      {ts.solutionSeen && !ts.solved && !cooling && (
        <button
          type="button"
          onClick={() => flow.setSolutionOpen(true)}
          className="self-start text-sm font-medium text-zinc-600 underline underline-offset-4 hover:text-foreground"
        >
          Show the example again
        </button>
      )}

      {ts.solved && (
        <button
          type="button"
          onClick={onNext}
          className="self-start rounded-full bg-foreground px-6 py-3 font-medium text-background transition-opacity hover:opacity-80"
        >
          {isLastTask ? "Finish lesson" : "Next task →"}
        </button>
      )}
    </>
  );
}

// One titled box in the output area ("Your result", "Expected result", …)
export function ResultPane({
  title,
  className = "",
  children,
}: {
  title: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`flex min-h-0 min-w-0 flex-col border-zinc-200 ${className}`}>
      <p className="border-b border-zinc-200 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-500">
        {title}
      </p>
      <div className="max-h-80 min-h-0 flex-1 overflow-hidden">{children}</div>
    </div>
  );
}

// Row of task markers: done ✓, current, or locked
export function TaskSteps({ count, current, solved, finished }: { count: number; current: number; solved: boolean; finished: boolean }) {
  return (
    <ol className="flex gap-1.5" aria-label="Tasks">
      {Array.from({ length: count }, (_, i) => {
        const done = finished || i < current || (i === current && solved);
        const active = !finished && i === current;
        return (
          <li
            key={i}
            aria-current={active ? "step" : undefined}
            className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold ${
              done
                ? "bg-green-600 text-white"
                : active
                  ? "bg-foreground text-background"
                  : "bg-zinc-100 text-zinc-400"
            }`}
          >
            {done ? "✓" : i > current ? "🔒" : i + 1}
          </li>
        );
      })}
    </ol>
  );
}
