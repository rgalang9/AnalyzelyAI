"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { LessonSummary, RLesson } from "@/lib/learn/lesson-types";
import {
  getRSession,
  getRStatus,
  inspectPlot,
  inspectR,
  restartR,
  restoreSession,
  runR,
  saveSession,
  setUpLesson,
  startR,
  subscribeRStatus,
  type RStatus,
} from "@/lib/learn/r/runner";
import { friendlyRError, gradeR } from "@/lib/learn/r/check";
import { codeToRun } from "@/lib/learn/r/statement";
import CodeEditor, { type RunTarget } from "./code-editor";
import LessonSidebar from "./lesson-sidebar";
import { LessonDone, Markdown } from "./lesson-parts";
import { TaskHelp, TaskSteps, useTaskFlow } from "./task-flow";

// An R lesson, laid out like RStudio: the task panel on the left; on the right a script editor
// (Run runs the current line or selection, like Ctrl/Cmd+Enter), the console under it, and a
// Plots pane beside them. Tasks share one R session, in order. Each task is checked by its
// result (lib/learn/r/check.ts) after every run.

type ConsoleLine = { kind: "cmd" | "out" | "err" | "note"; text: string };
const LOADING: RStatus = { state: "idle", text: "", pct: 0 };

export default function RLessonPlayer({
  lesson,
  datasets,
  lessons,
  nextLesson,
}: {
  lesson: RLesson;
  datasets: Record<string, string>; // lesson CSVs: "sales" → the file's text
  lessons: LessonSummary[];
  nextLesson: LessonSummary | null;
}) {
  const flow = useTaskFlow(lesson);
  const { started, setStarted, taskIndex, task, isLastTask, finished, ts, goToTask, finishLesson, solve, miss, say } = flow;
  const status = useSyncExternalStore(subscribeRStatus, getRStatus, () => LOADING);
  const [sessionReady, setSessionReady] = useState(false); // R is up and the lesson's data is loaded
  const [script, setScript] = useState(lesson.starter_code);
  const [lines, setLines] = useState<ConsoleLine[]>([]);
  const [plot, setPlot] = useState<ImageBitmap | null>(null);
  const [running, setRunning] = useState(false);
  const editor = useRef<{ runTarget: () => RunTarget | null } | null>(null);
  const consoleEnd = useRef<HTMLDivElement>(null);
  const plotCanvas = useRef<HTMLCanvasElement>(null);
  const taskScript = useRef(lesson.starter_code); // the script as it was when this task began
  const session = useRef<number | null>(null); // the R session holding this lesson's work

  const write = (more: ConsoleLine[]) => setLines((l) => [...l, ...more]);

  // Fills R for this lesson at the current task: its data, the answers of the tasks already done,
  // and a saved copy for Reset task. (A task already solved keeps its answer, for the next task.)
  async function loadSession() {
    const mine = await setUpLesson(datasets);
    session.current = mine;
    for (const t of lesson.tasks.slice(0, taskIndex)) {
      if (getRSession() !== mine) return; // another lesson took R over
      await runR(t.answer);
    }
    if (getRSession() !== mine) return;
    await saveSession(`task-${taskIndex}`);
    if (ts.solved) await runR(task.answer);
  }

  // R starts (or is already running from an earlier lesson), then this lesson's data loads.
  // Next.js also runs this when the learner comes back to a hidden lesson. R is shared by every
  // lesson, so it's only reloaded if another lesson has used it since: otherwise a reload would
  // wipe the learner's work.
  useEffect(() => {
    let cancelled = false;
    startR()
      .then(async () => {
        if (cancelled || session.current === getRSession()) return;
        const returning = session.current !== null;
        setSessionReady(false);
        await loadSession();
        if (returning) write([{ kind: "note", text: "— R was set up again. Your earlier tasks were run again. —" }]);
      })
      .then(() => !cancelled && setSessionReady(true))
      .catch(() => {}); // the failed status shows on screen
    return () => {
      cancelled = true;
    };
    // Not when the task changes: only coming back or new data can leave R without this lesson's work
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [datasets]);

  useEffect(() => consoleEnd.current?.scrollIntoView({ block: "nearest" }), [lines]);

  // The latest chart, drawn into the Plots pane
  useEffect(() => {
    const canvas = plotCanvas.current;
    if (!canvas || !plot) return;
    canvas.width = plot.width;
    canvas.height = plot.height;
    canvas.getContext("2d")?.drawImage(plot, 0, 0);
  }, [plot]);

  // A task begins: its starter code (if it has one) and a saved copy of the session for Reset task
  async function beginTask(index: number) {
    const t = lesson.tasks[index];
    const start = t.starter_code ?? script;
    if (t.starter_code !== undefined) setScript(t.starter_code);
    taskScript.current = start;
    await saveSession(`task-${index}`);
  }

  async function start() {
    setStarted(true);
    await beginTask(0);
  }

  async function next() {
    if (isLastTask) return finishLesson();
    goToTask(taskIndex + 1);
    await beginTask(taskIndex + 1);
  }

  // Run code in the console, then check the task by its result
  async function run(code: string, { check = true } = {}) {
    if (!code.trim() || running) return;
    setRunning(true);
    write(code.split("\n").map((text, i) => ({ kind: "cmd", text: `${i === 0 ? ">" : "+"} ${text}` })));
    try {
      const result = await runR(code);
      write(result.lines.map((l) => ({ kind: l.kind, text: l.text })));
      if (result.error) write([{ kind: "err", text: friendlyRError(result.error) }]);
      if (result.plots.length > 0) setPlot(result.plots[result.plots.length - 1]);
      if (check && started && !finished && !ts.solved) await grade(code, result.error, result.lines.filter((l) => l.kind === "out").map((l) => l.text).join("\n"));
    } finally {
      setRunning(false);
    }
  }

  async function grade(code: string, error: string | null, printed: string) {
    if (error) return miss(friendlyRError(error));
    const check = task.check;
    const object = check.type === "value" || check.type === "data_frame" ? await inspectR(check.name) : undefined;
    const plotInfo = check.type === "plot" ? await inspectPlot() : undefined;
    const result = gradeR(check, { code: `${script}\n${code}`, printed, object, plot: plotInfo, answer: task.answer });
    if (result.status === "pass") return solve("Nice work! That's right. 🎉");
    if (result.status === "wrong") return miss(result.message);
    say(result.note);
  }

  // The Run button and Ctrl/Cmd+Enter: the selection, or the statement on the cursor's line
  function runTarget(target: RunTarget | null) {
    if (!target) return;
    const { code, next } = codeToRun(target.doc, target.from, target.to);
    if (target.from === target.to) target.moveCursor(next);
    void run(code);
  }

  // Show answer: run the task's answer, so later tasks still have what they need
  async function showAnswer() {
    setScript((s) => `${s.trimEnd()}\n\n${task.answer}\n`);
    await run(task.answer, { check: false });
    solve(`Here's the answer, run for you:\n${task.answer}`);
  }

  // Reset task: the session and the script as they were when this task began
  async function resetTask() {
    await restoreSession(`task-${taskIndex}`);
    setScript(taskScript.current);
    write([{ kind: "note", text: "— Task reset: R is back to how it was when this task started —" }]);
    goToTask(taskIndex);
  }

  // Stop: R can't be interrupted here, so it's thrown away and started again, then filled again
  // so this task can carry on.
  async function stopR() {
    setRunning(false);
    setSessionReady(false);
    await restartR();
    await loadSession();
    write([{ kind: "note", text: "— R was restarted. Your earlier tasks were run again. —" }]);
    setSessionReady(true);
  }

  const canType = started && !finished && sessionReady;

  return (
    <div className="mt-4 grid gap-4 lg:grid-cols-[14rem_minmax(0,1fr)]">
      <div className="self-start">
        <LessonSidebar language="r" lessons={lessons} currentId={lesson.id} />
      </div>
      <div className="grid min-w-0 gap-4 xl:grid-cols-[22rem_minmax(0,1fr)]">
        {/* ---------- Task panel ---------- */}
        <section className="flex flex-col gap-4">
          <TaskSteps count={lesson.tasks.length} current={started ? taskIndex : -1} solved={ts.solved} finished={finished} />
          {!started ? (
            <>
              <p className="whitespace-pre-line leading-7">{lesson.explanation}</p>
              <button
                type="button"
                onClick={() => void start()}
                disabled={!sessionReady}
                className="self-start rounded-full bg-foreground px-6 py-3 font-medium text-background transition-opacity hover:opacity-80 disabled:cursor-wait disabled:opacity-40"
              >
                Got it
              </button>
            </>
          ) : finished ? (
            <LessonDone recap={lesson.recap} language="r" nextLesson={nextLesson} />
          ) : (
            <>
              <details className="rounded-xl border border-zinc-200 px-4 py-2 text-sm">
                <summary className="cursor-pointer font-medium">Explanation</summary>
                <p className="mt-2 whitespace-pre-line leading-6">{lesson.explanation}</p>
              </details>
              {task.teach && (
                <div className="rounded-xl bg-zinc-50 px-4 py-3 text-sm leading-6">
                  <Markdown text={task.teach} />
                </div>
              )}
              <div className="font-medium leading-7">
                <Markdown text={task.prompt} />
              </div>
              <TaskHelp flow={flow} onNext={() => void next()} />
              {(ts.solutionOpen || ts.solutionSeen) && !ts.solved && (
                <div className="rounded-xl border border-zinc-200 p-4 text-sm">
                  <p className="font-semibold">Here&rsquo;s one way to do it 💡</p>
                  <pre className="mt-2 overflow-x-auto rounded-lg bg-zinc-50 p-3 font-mono text-xs">{task.answer}</pre>
                  <p className="mt-2 text-zinc-600">Try typing it yourself. Or let R run it for you:</p>
                  <button
                    type="button"
                    onClick={() => void showAnswer()}
                    disabled={running}
                    className="mt-2 rounded-full border border-zinc-300 px-4 py-1.5 font-medium hover:bg-zinc-100 disabled:opacity-40"
                  >
                    Show answer
                  </button>
                </div>
              )}
              {!ts.solved && (
                <button
                  type="button"
                  onClick={() => void resetTask()}
                  disabled={running}
                  className="self-start text-sm text-zinc-500 underline underline-offset-4 hover:text-foreground disabled:opacity-40"
                >
                  Reset task
                </button>
              )}
            </>
          )}
        </section>

        {/* ---------- RStudio-style panes ---------- */}
        <section className="relative grid h-[75vh] min-h-[32rem] min-w-0 overflow-hidden rounded-2xl border border-zinc-200 xl:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
          <div className="grid min-h-0 min-w-0 grid-rows-[minmax(0,55%)_minmax(0,45%)] border-zinc-200 xl:border-r">
            {/* Script */}
            <div className="flex min-h-0 flex-col">
              <div className="flex items-center gap-2 border-b border-zinc-200 bg-zinc-50 px-3 py-1.5">
                <span className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Script</span>
                <span className="ml-auto text-xs text-zinc-400">Ctrl/⌘ + Enter runs the line</span>
                <button
                  type="button"
                  onClick={() => runTarget(editor.current?.runTarget() ?? null)}
                  disabled={!canType || running}
                  className="rounded-md bg-foreground px-3 py-1 text-xs font-medium text-background hover:opacity-80 disabled:opacity-40"
                >
                  ▶ Run
                </button>
                <button
                  type="button"
                  onClick={() => void run(script)}
                  disabled={!canType || running}
                  className="rounded-md border border-zinc-300 px-3 py-1 text-xs font-medium hover:bg-zinc-100 disabled:opacity-40"
                >
                  Run all
                </button>
              </div>
              <div className="min-h-0 flex-1 overflow-auto">
                <CodeEditor language="r" value={script} onChange={setScript} onRun={runTarget} readOnly={!canType} controlRef={editor} />
              </div>
            </div>

            {/* Console */}
            <div className="flex min-h-0 flex-col border-t border-zinc-200">
              <div className="flex items-center gap-2 border-b border-zinc-200 bg-zinc-50 px-3 py-1.5">
                <span className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Console</span>
                {running && <span className="animate-pulse text-xs text-zinc-500">Running…</span>}
                {running && (
                  <button type="button" onClick={() => void stopR()} className="ml-auto rounded-md border border-red-300 px-2 py-0.5 text-xs text-red-700 hover:bg-red-50">
                    Stop
                  </button>
                )}
                {!running && (
                  <button type="button" onClick={() => setLines([])} className="ml-auto text-xs text-zinc-500 hover:text-foreground">
                    Clear
                  </button>
                )}
              </div>
              <div className="min-h-0 flex-1 overflow-auto px-3 py-2 font-mono text-xs leading-5">
                {lines.map((l, i) => (
                  <pre
                    key={i}
                    className={`whitespace-pre-wrap ${
                      l.kind === "cmd" ? "text-blue-800" : l.kind === "err" ? "text-red-700" : l.kind === "note" ? "text-zinc-400" : "text-zinc-900"
                    }`}
                  >
                    {l.text}
                  </pre>
                ))}
                <div ref={consoleEnd} />
              </div>
            </div>
          </div>

          {/* Plots */}
          <div className="flex min-h-0 min-w-0 flex-col border-t border-zinc-200 xl:border-t-0">
            <p className="border-b border-zinc-200 bg-zinc-50 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-500">Plots</p>
            <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto p-2">
              {plot ? (
                <canvas ref={plotCanvas} aria-label="Your chart" role="img" className="h-auto max-w-full" />
              ) : (
                <p className="px-4 text-center text-sm text-zinc-400">Charts you make with ggplot() show here.</p>
              )}
            </div>
          </div>

          {/* Loading screen: webR and the packages, the first time */}
          {!sessionReady && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-white/95 p-6 text-center">
              {status.state === "failed" ? (
                <p className="max-w-sm text-red-700">{status.text}</p>
              ) : (
                <>
                  <p className="text-lg font-semibold">Starting R… this takes a few seconds the first time</p>
                  <p className="text-sm text-zinc-500">{status.state === "ready" ? "Loading the lesson's data…" : status.text || "Getting ready…"}</p>
                  <div className="h-2 w-64 overflow-hidden rounded-full bg-zinc-100">
                    <div className="h-full bg-purple transition-all" style={{ width: `${status.state === "ready" ? 95 : status.pct}%` }} />
                  </div>
                </>
              )}
            </div>
          )}
          {sessionReady && !started && (
            <div className="absolute inset-0 flex items-center justify-center bg-white/70">
              <p className="rounded-full bg-white px-5 py-2.5 text-sm font-medium shadow">Read the explanation, then press Got it</p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
