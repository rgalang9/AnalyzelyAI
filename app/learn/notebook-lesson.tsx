"use client";

import { useEffect, useRef, useState } from "react";
import type { LessonSummary, NotebookCell, NotebookLesson } from "@/lib/learn/lesson-types";
import {
  getPythonSession,
  preloadPython,
  runCell,
  stopPython,
  type PyOutput,
  type PyRunResult,
} from "@/lib/learn/python/runner";
import { useLearnProgress } from "./progress-context";
import CodeEditor from "./code-editor";
import LessonSidebar from "./lesson-sidebar";
import { Feedback, HINT_PAUSE_MS, LessonDone, Markdown, nudge } from "./lesson-parts";
import { FillCode, PyOutputView, PythonStatusBar, usePythonStatus } from "./python-lesson";

// The notebook view for Python: one lesson is one scrolling notebook, like JupyterLab.
// Every code cell runs in the same Python session, top to bottom, so variables carry over.
// A cell opens once the one above it is done.

const BLANK = "___";

// Where one cell is: its code, what it showed, and how the learner is getting on
type CellState = {
  code: string; // write cells: what's in the editor
  blanks: string[]; // fill cells: what's in each blank
  count: number | null; // the n in In [n]: (null = not run yet)
  output: PyOutput | null;
  done: boolean;
  picked: boolean; // predict cells: the right option is picked, so it can run
  wrongPicks: string[];
  tries: number; // wrong answers so far (for the hints)
  hintsShown: number;
  cooling: boolean; // short pause after a wrong answer
  feedback: { tone: "good" | "try"; text: string } | null;
};

const freshCell = (cell: NotebookCell): CellState => ({
  code: cell.type === "write" ? (cell.starter ?? "") : "code" in cell ? cell.code : "",
  blanks: cell.type === "fill" ? cell.code.split(BLANK).slice(1).map(() => "") : [],
  count: null,
  output: null,
  done: false,
  picked: false,
  wrongPicks: [],
  tries: 0,
  hintsShown: 0,
  cooling: false,
  feedback: null,
});

const fillIn = (code: string, blanks: string[]) =>
  code.split(BLANK).reduce((all, part, i) => all + (i === 0 ? "" : blanks[i - 1] ?? "") + part, "");

const usesPandas = (lesson: NotebookLesson) =>
  lesson.datasets.length > 0 || /\b(pandas|pd)\b/.test(JSON.stringify([lesson.setup, lesson.cells]));
const usesCharts = (lesson: NotebookLesson) =>
  lesson.cells.some((c) => "compare" in c && c.compare === "chart") || /\.plot\b|\.hist\(|\bplt\b/.test(JSON.stringify(lesson.cells));

export default function NotebookPlayer({
  lesson,
  files,
  language,
  lessons,
  nextLesson,
}: {
  lesson: NotebookLesson;
  files: Record<string, string>;
  language: string;
  lessons: LessonSummary[];
  nextLesson: LessonSummary | null;
}) {
  const { markComplete } = useLearnProgress();
  const python = usePythonStatus();
  const [cells, setCells] = useState<CellState[]>(() => lesson.cells.map(freshCell));
  const [runningIndex, setRunningIndex] = useState<number | null>(null);
  const counter = useRef(0); // In [n]: numbers, like Jupyter
  const history = useRef<string[]>([]); // code run so far in this session, to rebuild it after a restart
  const sessionSeen = useRef<number | null>(null);
  const timers = useRef<number[]>([]);

  useEffect(() => {
    preloadPython({ pandas: usesPandas(lesson), charts: usesCharts(lesson) });
  }, [lesson]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  // The first code cell that isn't done yet. Everything above it is open (markdown is done once shown).
  const frontier = (() => {
    const i = lesson.cells.findIndex((c, n) => c.type !== "markdown" && !cells[n].done);
    return i === -1 ? lesson.cells.length : i;
  })();
  const finished = frontier === lesson.cells.length;

  // Once, when the last cell is done. (markComplete changes every time progress changes, so
  // without the `marked` check this would run again and again, and the page couldn't move on.)
  const marked = useRef(false);
  useEffect(() => {
    if (finished && !marked.current) {
      marked.current = true;
      markComplete(lesson.id);
    }
  }, [finished, lesson.id, markComplete]);

  const update = (i: number, change: Partial<CellState> | ((s: CellState) => Partial<CellState>)) =>
    setCells((all) => all.map((s, n) => (n === i ? { ...s, ...(typeof change === "function" ? change(s) : change) } : s)));

  // Runs a cell in the shared session. After a restart (Stop, time limit) the session is new,
  // so everything that ran before is run again quietly first, to bring the variables back.
  async function execute(
    code: string,
    check?: { answer: string; compare: "print" | "table" | "value" | "chart" | "any_text"; variable?: string }
  ) {
    let reset = sessionSeen.current !== getPythonSession();
    if (reset && sessionSeen.current !== null) {
      for (const [n, earlier] of history.current.entries()) {
        await runCell({ files, setup: lesson.setup, code: earlier, reset: n === 0 });
      }
      reset = history.current.length === 0;
    }
    sessionSeen.current = getPythonSession();
    const res = await runCell({ files, setup: lesson.setup, code, reset, ...check });
    if (res.kind === "done" && !res.output.error) history.current.push(code);
    return res;
  }

  // A wrong try. `plain`: the message stands on its own (a code error, a wrong pick), so it
  // doesn't get an "almost there!" opener in front.
  function miss(i: number, reason: string, plain = false) {
    const cell = lesson.cells[i];
    const hints = "hints" in cell ? cell.hints : [];
    const tries = cells[i].tries + 1;
    update(i, { tries, cooling: true, feedback: { tone: "try", text: plain ? reason : `${nudge(tries)} ${reason}` } });
    timers.current.push(
      window.setTimeout(() => update(i, (s) => ({ cooling: false, hintsShown: Math.min(hints.length, Math.max(s.hintsShown, tries)) })), HINT_PAUSE_MS)
    );
  }

  const outputOf = (res: PyRunResult): PyOutput =>
    res.kind === "done"
      ? res.output
      : {
          stdout: "",
          table: null,
          value: null,
          charts: [],
          error:
            res.reason === "timeout"
              ? "Your code ran for more than 10 seconds, so we stopped it. Is there a loop that never ends?"
              : "You stopped the code.",
        };

  async function handleRun(i: number) {
    const cell = lesson.cells[i];
    const state = cells[i];
    if (cell.type === "markdown" || i > frontier || runningIndex !== null || state.cooling || python.state !== "ready") return;
    if (cell.type === "predict" && !state.picked) return;

    const code = cell.type === "fill" ? fillIn(cell.code, state.blanks) : cell.type === "write" ? state.code : cell.code;
    if (cell.type === "fill" && state.blanks.some((b) => !b.trim())) {
      return update(i, { feedback: { tone: "try", text: "Fill in every blank, then press Run." } });
    }
    if (!code.trim()) return update(i, { feedback: { tone: "try", text: "Type some code first, then press Run." } });
    if (cell.type === "write" && cell.starter && code.trim() === cell.starter.trim() && !state.done) {
      return update(i, { feedback: { tone: "try", text: "The start is there for you. Finish the code, then press Run." } });
    }

    const checking = (cell.type === "fill" || cell.type === "write") && !state.done;
    setRunningIndex(i);
    const res = await execute(
      code,
      checking ? { answer: cell.answer, compare: cell.compare, variable: cell.variable } : undefined
    );
    setRunningIndex(null);
    update(i, { count: ++counter.current, output: outputOf(res) });

    if (res.kind === "stopped") {
      if (checking && res.reason === "timeout") miss(i, outputOf(res).error!, true);
      return;
    }
    // Predict cells are checked by the option picked (already right by now), not by the output
    if (cell.type === "predict") {
      if (!state.done) update(i, { done: true, feedback: { tone: "good", text: "There it is. Your prediction was right! 🎉" } });
      return;
    }
    if (cell.type === "run") {
      if (!res.output.error && !state.done) {
        update(i, { done: true, feedback: null });
      }
      return;
    }
    if (!checking || !res.check) return;
    if (!res.check.match) return miss(i, res.check.reason, !!res.output.error);
    const missing = cell.type === "write" ? (cell.require ?? []).filter((bit) => !code.includes(bit)) : [];
    if (missing.length > 0) return miss(i, `Your output is right, but this cell wants you to use ${missing.join(" and ")} in your code.`);
    update(i, { done: true, cooling: false, feedback: { tone: "good", text: "Nice work! Your output matches exactly. 🎉" } });
  }

  function handlePick(i: number, option: string) {
    const cell = lesson.cells[i];
    const state = cells[i];
    if (cell.type !== "predict" || state.picked || state.cooling) return;
    if (option === cell.answer) {
      update(i, { picked: true, feedback: { tone: "good", text: `Yes, ${option}! Now press Run to check.` } });
    } else {
      update(i, (s) => ({ wrongPicks: [...s.wrongPicks, option] }));
      miss(i, `Not that one: it isn't ${option}. Read the code again and have another go.`, true);
    }
  }

  return (
    <div className="mt-4 grid gap-4 lg:grid-cols-[14rem_minmax(0,1fr)]">
      <div className="self-start">
        <LessonSidebar language={language} lessons={lessons} currentId={lesson.id} />
      </div>

      <section data-python={python.state} className="min-w-0 overflow-hidden rounded-2xl border border-zinc-200 bg-white">
        <div className="flex items-center gap-3 border-b border-zinc-200 bg-zinc-50 px-4 py-2 text-sm">
          <span className="font-medium">📓 {lesson.title}</span>
          <span className="ml-auto text-xs text-zinc-500">Python 3 · Shift/⌘ + Enter runs a cell</span>
        </div>
        <PythonStatusBar status={python} />
        <p className="border-b border-zinc-200 bg-zinc-50 px-4 py-2 text-xs text-zinc-500 md:hidden">
          💻 Python works on phones, but it&rsquo;s quicker and easier on a laptop.
        </p>

        <div className="flex flex-col gap-4 px-3 py-5 sm:px-5">
          {lesson.cells.slice(0, frontier + 1).map((cell, i) => (
            <Cell
              key={i}
              cell={cell}
              state={cells[i]}
              running={runningIndex === i}
              canRun={python.state === "ready" && runningIndex === null && !cells[i].cooling}
              onRun={() => handleRun(i)}
              onPick={(option) => handlePick(i, option)}
              onCode={(code) => update(i, { code })}
              onBlanks={(blanks) => update(i, { blanks })}
            />
          ))}
          {!finished && frontier < lesson.cells.length - 1 && (
            <p className="pl-16 text-sm text-zinc-400">
              🔒 {lesson.cells.length - frontier - 1} more cell{lesson.cells.length - frontier - 1 === 1 ? "" : "s"} below. Finish
              this one to open the next.
            </p>
          )}
          {finished && <LessonDone recap={lesson.recap} language={language} nextLesson={nextLesson} />}
        </div>
      </section>
    </div>
  );
}

// One notebook cell: markdown text, or code with its In [n]: label, Run button and output
function Cell({
  cell,
  state,
  running,
  canRun,
  onRun,
  onPick,
  onCode,
  onBlanks,
}: {
  cell: NotebookCell;
  state: CellState;
  running: boolean;
  canRun: boolean;
  onRun: () => void;
  onPick: (option: string) => void;
  onCode: (code: string) => void;
  onBlanks: (blanks: string[]) => void;
}) {
  if (cell.type === "markdown") {
    return (
      <div className="pl-16 leading-7 text-zinc-800">
        <Markdown text={cell.text} />
      </div>
    );
  }

  const readOnly = cell.type === "run" || cell.type === "predict";
  const waitingForPick = cell.type === "predict" && !state.picked;
  const editorCode = cell.type === "write" ? state.code : cell.code;
  const lines = editorCode.split("\n").length + (cell.type === "write" ? 1 : 0);
  const hints = "hints" in cell ? cell.hints : [];
  const showOut = state.output && (state.output.table || state.output.value);

  return (
    <div className="flex flex-col gap-2">
      {(cell.type === "write" || cell.type === "fill") && cell.prompt && (
        <p className="pl-16 font-medium leading-7">✏️ {cell.prompt}</p>
      )}
      {cell.type === "run" && cell.prompt && <p className="pl-16 font-medium leading-7">▶️ {cell.prompt}</p>}
      {cell.type === "predict" && (
        <p className="pl-16 font-medium leading-7">🤔 {cell.prompt ?? "What will this print? Pick one, then run it."}</p>
      )}

      <div className="flex gap-2">
        <span className="w-14 shrink-0 pt-2.5 text-right font-mono text-xs text-blue-700">
          In [{state.count ?? " "}]:
        </span>
        <div
          // Focusable (click it, even read-only code) so Shift+Enter runs it, like Jupyter.
          // Caught before the editor, which would otherwise add a new line first.
          tabIndex={0}
          className={`min-w-0 flex-1 overflow-hidden rounded border bg-zinc-50 outline-none focus-within:ring-2 focus-within:ring-blue-200 ${state.done ? "border-zinc-200" : "border-blue-300"}`}
          onKeyDownCapture={(e) => {
            if (e.key === "Enter" && e.shiftKey) {
              e.preventDefault();
              e.stopPropagation();
              if (canRun && !waitingForPick) onRun();
            }
          }}
        >
          {cell.type === "fill" ? (
            <FillCode code={cell.code} blanks={state.blanks} onChange={onBlanks} onRun={onRun} disabled={state.done} />
          ) : (
            <div className="[&>div]:min-h-0" style={{ height: `${Math.max(1, lines) * 22.4 + 18}px` }}>
              <CodeEditor language="python" value={editorCode} onChange={onCode} onRun={onRun} readOnly={readOnly} />
            </div>
          )}
        </div>
        <div className="flex shrink-0 flex-col gap-1">
          {running ? (
            <button type="button" onClick={stopPython} title="Stop" className="rounded border border-zinc-300 bg-white px-2.5 py-1.5 text-xs font-semibold hover:bg-zinc-100">
              ■
            </button>
          ) : (
            <button
              type="button"
              onClick={onRun}
              disabled={!canRun || waitingForPick}
              title={waitingForPick ? "Pick an answer first" : "Run this cell"}
              className="rounded bg-purple px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-purple-dark disabled:cursor-not-allowed disabled:opacity-40"
            >
              ▶ Run
            </button>
          )}
          {state.done && <span className="text-center text-xs text-green-700" aria-label="Done">✓</span>}
        </div>
      </div>

      {cell.type === "predict" && (
        <div className="flex flex-wrap gap-2 pl-16">
          {cell.options.map((option) => {
            const triedWrong = state.wrongPicks.includes(option);
            const isAnswer = state.picked && option === cell.answer;
            return (
              <button
                key={option}
                type="button"
                onClick={() => onPick(option)}
                disabled={state.picked || state.cooling || triedWrong}
                className={`rounded-full border px-4 py-1.5 text-sm font-medium disabled:cursor-not-allowed ${
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
      )}

      {(state.feedback || state.cooling || state.hintsShown > 0) && (
        <div className="flex flex-col gap-2 pl-16">
          {state.feedback && <Feedback tone={state.feedback.tone}>{state.feedback.text}</Feedback>}
          {state.cooling && <p className="animate-pulse text-sm text-zinc-500">Have a think… a hint is on its way.</p>}
          {!state.done &&
            hints.slice(0, state.hintsShown).map((hint, n) => (
              <p key={n} className="rounded-xl bg-blue-50 px-4 py-2.5 text-sm text-blue-950">
                <span className="font-semibold">💡 Hint {n + 1}: </span>
                {hint}
              </p>
            ))}
        </div>
      )}

      {state.output && (
        <div className="flex gap-2">
          <span className="w-14 shrink-0 pt-2 text-right font-mono text-xs text-red-700">
            {showOut ? `Out[${state.count}]:` : ""}
          </span>
          <div className="max-h-96 min-w-0 flex-1 overflow-auto">
            {ranQuietly(state.output) ? (
              <p className="py-1 text-sm text-green-700">✓ Done</p>
            ) : (
              <PyOutputView output={state.output} empty="" />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// The cell ran fine but printed and showed nothing (e.g. it only defines a function)
const ranQuietly = (output: PyOutput) =>
  !output.stdout && !output.table && !output.value && !output.error && output.charts.length === 0;
