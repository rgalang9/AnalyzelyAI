"use client";

import { Fragment, useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { LessonSummary, PythonLesson, PythonTask, PyTourTarget } from "@/lib/learn/lesson-types";
import {
  getPythonStatus,
  preloadPython,
  runPython,
  stopPython,
  subscribePythonStatus,
  type PyOutput,
  type PyStatus,
} from "@/lib/learn/python/runner";
import CodeEditor from "./code-editor";
import ResultsGrid from "./results-grid";
import LessonSidebar from "./lesson-sidebar";
import { LessonDone, SolutionModal } from "./lesson-parts";
import {
  ExplanationRecall,
  LessonIntro,
  PredictOptions,
  ResultPane,
  TaskHelp,
  TaskSteps,
  useTaskFlow,
} from "./task-flow";

const TASK_LABELS: Record<PythonTask["type"], string> = {
  write: "",
  fill: " · Fill in the blank",
  run: " · Run it",
  predict: " · Predict",
};

const TOUR_LABELS: Record<PyTourTarget, string> = {
  lesson_list: "Lesson list",
  explanation: "Explanation",
  editor: "Code editor",
  run_button: "Run button",
  output: "Output",
  hint_button: "Hints",
};

const BLANK = "___";
const SERVER_STATUS: PyStatus = { state: "idle", text: "", pct: 0 };

function usePythonStatus() {
  return useSyncExternalStore(subscribePythonStatus, getPythonStatus, () => SERVER_STATUS);
}

// The code a fill task runs: its code with each ___ swapped for what the learner typed
const fillIn = (code: string, blanks: string[]) =>
  code.split(BLANK).reduce((all, part, i) => all + (i === 0 ? "" : blanks[i - 1] ?? "") + part, "");

const needsPandas = (lesson: PythonLesson) =>
  lesson.datasets.length > 0 || /\b(pandas|pd)\b/.test(lesson.setup);

export default function PythonLessonPlayer({
  lesson,
  files,
  language,
  lessons,
  nextLesson,
}: {
  lesson: PythonLesson;
  files: Record<string, string>; // the lesson's CSV files
  language: string;
  lessons: LessonSummary[];
  nextLesson: LessonSummary | null;
}) {
  const flow = useTaskFlow(lesson);
  const { started, taskIndex, task, finished, ts, cooling } = flow;
  const python = usePythonStatus();
  const [code, setCode] = useState("");
  const [blanks, setBlanks] = useState<string[]>([]);
  const [output, setOutput] = useState<PyOutput | null>(null);
  const [expected, setExpected] = useState<PyOutput | null>(null);
  const [running, setRunning] = useState(false);
  const [explored, setExplored] = useState<Set<PyTourTarget>>(new Set());
  const [spot, setSpot] = useState<PyTourTarget | null>(null); // tour part being looked at
  const busy = useRef(false); // stops double runs

  useEffect(() => {
    preloadPython({ pandas: needsPandas(lesson) });
  }, [lesson]);

  const tour = lesson.tour ?? [];
  const touring = tour.length > 0 && !started;
  const allExplored = tour.every((t) => explored.has(t.target));
  const ready = python.state === "ready";
  const isPredict = task.type === "predict";
  const checksResult = task.type !== "predict";

  function visit(target: PyTourTarget) {
    if (!touring) return;
    setSpot(target);
    if (tour.some((t) => t.target === target)) setExplored((prev) => new Set(prev).add(target));
  }

  // Every task starts fresh, with the expected output worked out from the lesson's answer
  async function openTask(index: number) {
    const t = lesson.tasks[index];
    let exp: PyOutput | null = null;
    if (t.type !== "predict") {
      const res = await runPython({ files, setup: lesson.setup, code: t.answer });
      if (res.kind === "done") exp = res.output;
    }
    flow.goToTask(index);
    setCode(t.type === "write" ? (t.starter ? `${t.starter}\n` : "") : t.code);
    setBlanks(t.type === "fill" ? t.code.split(BLANK).slice(1).map(() => "") : []);
    setOutput(null);
    setExpected(exp);
  }

  async function handleGotIt() {
    await openTask(0);
    flow.setStarted(true);
    setSpot(null);
  }

  async function handleNext() {
    if (flow.isLastTask) flow.finishLesson();
    else await openTask(taskIndex + 1);
  }

  async function handleRun() {
    if (!started || cooling || busy.current || !ready) return;
    if (isPredict && !ts.solved) return;
    const source = task.type === "fill" ? fillIn(task.code, blanks) : code;
    if (task.type === "fill" && blanks.some((b) => !b.trim())) {
      flow.say("Fill in every blank, then press Run.");
      return;
    }
    if (!source.trim()) {
      flow.say("Type some code first, then press Run.");
      return;
    }
    // Only the line we gave them: a nudge, not a wrong try
    if (task.type === "write" && task.starter && source.trim() === task.starter.trim() && !ts.solved) {
      flow.say("The first line is done for you. Add your code under it, then press Run.");
      return;
    }

    const checking = checksResult && !ts.solved && !finished;
    busy.current = true;
    setRunning(true);
    const res = await runPython({
      files,
      setup: lesson.setup,
      code: source,
      ...(checking && { answer: task.answer, compare: task.compare }),
    });
    busy.current = false;
    setRunning(false);

    if (res.kind === "stopped") {
      const text =
        res.reason === "timeout"
          ? "Your code ran for more than 10 seconds, so we stopped it. Is there a loop that never ends?"
          : "You stopped the code.";
      setOutput({ stdout: "", table: null, value: null, error: text });
      if (checking && res.reason === "timeout") flow.miss(text);
      return;
    }

    setOutput(res.output);
    if (!checking || !res.check) return;
    if (!res.check.match) return flow.miss(res.check.reason);
    const missing = task.type === "write" ? (task.require ?? []).filter((bit) => !source.includes(bit)) : [];
    if (missing.length > 0) {
      return flow.miss(`Your output is right, but this task wants you to use ${missing.join(" and ")} in your code.`);
    }
    flow.solve(
      task.type === "run"
        ? "Nice! You just ran Python code. 🎉"
        : "Nice work! Your output matches exactly. 🎉"
    );
  }

  async function handlePick(option: string) {
    if (task.type !== "predict" || ts.solved || cooling || busy.current) return;
    if (option !== task.answer) return flow.missPick(option);
    busy.current = true;
    const res = await runPython({ files, setup: lesson.setup, code: task.code });
    busy.current = false;
    if (res.kind === "done") setOutput(res.output);
    flow.solve(`Yes! The answer is ${option}. Here's the output so you can see for yourself.`);
  }

  const editorLocked = !started || task.type === "run" || (isPredict && !ts.solved);
  const canRun = started && ready && !cooling && !running && !(isPredict && !ts.solved);
  const spotProps = (target: PyTourTarget) => ({ target, active: touring && spot === target, onVisit: visit });

  return (
    <div className="mt-4 grid gap-4 lg:grid-cols-[14rem_minmax(0,1fr)]">
      <TourSpot {...spotProps("lesson_list")} className="self-start">
        <LessonSidebar language={language} lessons={lessons} currentId={lesson.id} />
      </TourSpot>

      <div className="grid min-w-0 gap-4 xl:grid-cols-[24rem_minmax(0,1fr)]">
        {/* ---------- Lesson panel ---------- */}
        <section className="flex flex-col gap-4">
          <TaskSteps count={lesson.tasks.length} current={started ? taskIndex : -1} solved={ts.solved} finished={finished} />
          <p className="rounded-xl bg-zinc-50 px-3 py-2 text-xs text-zinc-500 md:hidden">
            💻 Python works on phones, but it&rsquo;s quicker and easier on a laptop.
          </p>

          {!started ? (
            <>
              {touring && (
                <div className="rounded-xl border border-zinc-200 px-4 py-3 text-sm" aria-live="polite">
                  {spot ? (
                    <>
                      <p className="font-semibold">{TOUR_LABELS[spot]}</p>
                      <p className="mt-1 leading-6">{tour.find((t) => t.target === spot)?.explain}</p>
                    </>
                  ) : (
                    <p className="text-zinc-500">Hover over (or tap) each highlighted part of the screen to see what it does.</p>
                  )}
                  <ul className="mt-3 flex flex-wrap gap-1.5" aria-label="Parts explored">
                    {tour.map((t) => (
                      <li
                        key={t.target}
                        className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                          explored.has(t.target) ? "bg-green-100 text-green-900" : "bg-zinc-100 text-zinc-500"
                        }`}
                      >
                        {explored.has(t.target) ? "✓ " : ""}
                        {TOUR_LABELS[t.target]}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <TourSpot {...spotProps("explanation")} className="flex flex-col gap-4">
                <LessonIntro
                  explanation={lesson.explanation}
                  exampleLines={lesson.example.lines}
                  ready={ready && allExplored}
                  onGotIt={handleGotIt}
                />
              </TourSpot>
              {touring && !allExplored && (
                <p className="text-sm text-zinc-500">Explore all {tour.length} parts of the screen to continue.</p>
              )}
              {touring && (
                <TourSpot {...spotProps("hint_button")}>
                  <p className="rounded-xl bg-blue-50 px-4 py-3 text-sm text-blue-950">
                    <span className="font-semibold">💡 Hints</span> show up here when you need them.
                  </p>
                </TourSpot>
              )}
            </>
          ) : finished ? (
            <LessonDone recap={lesson.recap} language={language} nextLesson={nextLesson} />
          ) : (
            <>
              <ExplanationRecall explanation={lesson.explanation} exampleLines={lesson.example.lines} />
              <div className="rounded-2xl border border-zinc-200 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                  Task {taskIndex + 1} of {lesson.tasks.length}
                  {TASK_LABELS[task.type]}
                </p>
                <p className="mt-1 font-medium leading-7">{task.prompt}</p>
                {task.type === "predict" && (
                  <PredictOptions options={task.options} answer={task.answer} flow={flow} onPick={handlePick} />
                )}
              </div>
              <TaskHelp flow={flow} onNext={handleNext} />
            </>
          )}
        </section>

        {/* ---------- Workspace ---------- */}
        <section
          data-python={python.state} // lets tests (and support) see whether Python is ready
          className="flex min-h-[36rem] min-w-0 flex-col overflow-hidden rounded-2xl border border-zinc-200"
        >
          <div className="flex items-center gap-3 border-b border-zinc-200 bg-zinc-50 px-3 py-2">
            <span className="text-sm font-medium">Python editor</span>
            <span className="hidden text-xs text-zinc-500 sm:inline">
              {task.type === "fill" && started
                ? "Type in the blanks"
                : editorLocked && started
                  ? isPredict && !ts.solved
                    ? "Read-only: pick an answer first"
                    : "Read-only: just press Run"
                  : "Ctrl/⌘ + Enter to run"}
            </span>
            <div className="ml-auto flex items-center gap-2">
              {running && (
                <button
                  type="button"
                  onClick={stopPython}
                  className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm font-semibold hover:bg-zinc-100"
                >
                  ■ Stop
                </button>
              )}
              <TourSpot {...spotProps("run_button")}>
                <button
                  type="button"
                  onClick={handleRun}
                  disabled={!canRun}
                  className="rounded-md bg-purple px-4 py-1.5 text-sm font-semibold text-white hover:bg-purple-dark disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {running ? "Running…" : "▶ Run"}
                </button>
              </TourSpot>
            </div>
          </div>

          <PythonStatusBar status={python} />

          <TourSpot {...spotProps("editor")} className="relative h-56 shrink-0 overflow-auto border-b border-zinc-200">
            {task.type === "fill" && started ? (
              <FillCode code={task.code} blanks={blanks} onChange={setBlanks} onRun={handleRun} disabled={ts.solved || finished} />
            ) : (
              <CodeEditor language="python" value={code} onChange={setCode} onRun={handleRun} readOnly={editorLocked} />
            )}
            {!started && (
              <div className="absolute inset-0 flex items-center justify-center bg-background/80 p-6 text-center text-sm text-zinc-600">
                🔒 Read the explanation and example, then press &ldquo;Got it&rdquo; to start.
              </div>
            )}
          </TourSpot>

          <TourSpot {...spotProps("output")} className={`grid min-h-64 flex-1 ${checksResult ? "lg:grid-cols-2" : ""}`}>
            <ResultPane title={isPredict ? "Output" : "Your output"}>
              <PyOutputView
                output={output}
                empty={
                  isPredict && started && !ts.solved
                    ? "Pick an answer to see the output."
                    : "Run your code to see the output here."
                }
              />
            </ResultPane>
            {checksResult && started && expected && (
              <ResultPane title="Expected output" className="border-t lg:border-l lg:border-t-0">
                <PyOutputView output={expected} empty="" />
              </ResultPane>
            )}
          </TourSpot>
        </section>
      </div>

      {ts.solutionOpen && <SolutionModal lines={task.solution_lines} onClose={() => flow.setSolutionOpen(false)} />}
    </div>
  );
}

// A part of the screen that Lesson 0's tour points at: highlighted while it's being explained
function TourSpot({
  target,
  active,
  onVisit,
  className = "",
  children,
}: {
  target: PyTourTarget;
  active: boolean;
  onVisit: (target: PyTourTarget) => void;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      data-tour={target}
      onPointerEnter={() => onVisit(target)}
      onClick={() => onVisit(target)}
      onFocusCapture={() => onVisit(target)}
      className={`${className} rounded-2xl transition-shadow ${active ? "ring-4 ring-purple ring-offset-2" : ""}`}
    >
      {children}
    </div>
  );
}

// Loading bar while Python downloads or restarts (hidden once it's ready)
function PythonStatusBar({ status }: { status: PyStatus }) {
  if (status.state === "ready" || status.state === "idle") return null;
  if (status.state === "failed") {
    return <p className="border-b border-zinc-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">{status.text}</p>;
  }
  return (
    <div className="border-b border-zinc-200 px-3 py-2" role="status">
      <p className="text-xs text-zinc-600">
        {status.text}
        {status.state === "loading" && " The first time takes a little while; after that it's quick."}
      </p>
      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-zinc-100">
        <div className="h-full rounded-full bg-purple transition-all duration-500" style={{ width: `${status.pct}%` }} />
      </div>
    </div>
  );
}

// Fill-in-the-blank: the code is read-only, with a small box in each ___ to type into
function FillCode({
  code,
  blanks,
  onChange,
  onRun,
  disabled,
}: {
  code: string;
  blanks: string[];
  onChange: (blanks: string[]) => void;
  onRun: () => void;
  disabled: boolean;
}) {
  const parts = code.split(BLANK);
  return (
    <pre className="whitespace-pre-wrap p-4 font-mono text-sm leading-8">
      {parts.map((part, i) => (
        <Fragment key={i}>
          {part}
          {i < parts.length - 1 && (
            <input
              aria-label={`Blank ${i + 1}`}
              value={blanks[i] ?? ""}
              autoFocus={i === 0}
              disabled={disabled}
              autoComplete="off"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              onChange={(e) => onChange(blanks.map((b, j) => (j === i ? e.target.value : b)))}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  onRun();
                }
              }}
              style={{ width: `${Math.max(4, (blanks[i] ?? "").length + 2)}ch` }}
              className="mx-0.5 rounded border-b-2 border-purple bg-purple-light/50 px-1 font-mono text-sm outline-none focus:bg-purple-light disabled:opacity-70"
            />
          )}
        </Fragment>
      ))}
    </pre>
  );
}

// What Python produced: printed text, a table, or another value (or a plain-words error)
function PyOutputView({ output, empty }: { output: PyOutput | null; empty: string }) {
  if (!output) return <p className="p-4 text-sm text-zinc-500">{empty}</p>;
  const nothing = !output.stdout && !output.table && !output.value && !output.error;
  return (
    <div className="flex h-full min-h-0 flex-col overflow-auto">
      {output.stdout && <pre className="whitespace-pre-wrap p-3 font-mono text-sm">{output.stdout}</pre>}
      {output.value && <pre className="whitespace-pre-wrap p-3 font-mono text-sm text-zinc-700">{output.value}</pre>}
      {output.table && (
        <div className="min-h-48 flex-1">
          <ResultsGrid
            result={{ columns: output.table.columns, rows: output.table.rows }}
            rowLabels={output.table.index}
            rowHeader={output.table.indexName}
            nullLabel="NaN"
            totalRows={output.table.total}
          />
        </div>
      )}
      {output.error && <p className="p-4 text-sm text-amber-800">{output.error}</p>}
      {nothing && <p className="p-4 text-sm text-zinc-500">Your code ran, but didn&rsquo;t print or show anything.</p>}
    </div>
  );
}
