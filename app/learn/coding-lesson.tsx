"use client";

import { useEffect, useRef, useState } from "react";
import type { Database } from "sql.js";
import type { CodingLesson, LessonSummary } from "@/lib/learn/lesson-types";
import {
  compareResults,
  createDatabase,
  describeTables,
  readTable,
  runQuery,
  type QueryResult,
  type TableInfo,
} from "@/lib/learn/sql/runner";
import { useLearnProgress } from "./progress-context";
import CodeLines from "./code-lines";
import ResultsGrid from "./results-grid";
import SchemaPanel from "./schema-panel";
import SqlEditor from "./sql-editor";
import { Feedback, HINT_PAUSE_MS, LessonDone, nudge, SolutionModal, TablePreviewModal } from "./lesson-parts";

// Where the learner is within the current task
type TaskState = {
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

// Turns SQLite's error messages into friendlier ones
function friendlyError(message: string) {
  let m = message.match(/no such column: (.+)/);
  if (m) return `There's no column called "${m[1]}". Check the Tables panel for the column names.`;
  m = message.match(/no such table: (.+)/);
  if (m) return `There's no table called "${m[1]}". Check the Tables panel for the table names.`;
  m = message.match(/near "(.+?)": syntax error/);
  if (m) return `Something's not quite right near "${m[1]}". Check the spelling and the commas.`;
  if (/incomplete input/.test(message)) return "The query looks unfinished. Is something missing at the end?";
  return message;
}

export default function CodingLessonPlayer({
  lesson,
  setupSql,
  language,
  nextLesson,
}: {
  lesson: CodingLesson;
  setupSql: string;
  language: string;
  nextLesson: LessonSummary | null;
}) {
  const { markComplete } = useLearnProgress();
  const [started, setStarted] = useState(false); // pressed "Got it"
  const [taskIndex, setTaskIndex] = useState(0);
  const [finished, setFinished] = useState(false);
  const [ts, setTs] = useState<TaskState>(FRESH_TASK);
  const [cooling, setCooling] = useState(false); // short pause after a wrong answer
  const [code, setCode] = useState("");
  const [result, setResult] = useState<QueryResult | null>(null);
  const [sqlError, setSqlError] = useState("");
  const [expected, setExpected] = useState<QueryResult | null>(null);
  const [tables, setTables] = useState<TableInfo[]>([]);
  const [tableData, setTableData] = useState<Record<string, QueryResult>>({}); // full tables, for previews
  const [viewing, setViewing] = useState<string | null>(null); // table open in the preview pop-up
  const [loadError, setLoadError] = useState("");
  const dbRef = useRef<Database | null>(null);
  const timer = useRef<number | undefined>(undefined);

  const task = lesson.tasks[taskIndex];
  const isPredict = task.type === "predict";

  // Load the database engine and read the table list for the side panel
  useEffect(() => {
    let cancelled = false;
    createDatabase(setupSql)
      .then((db) => {
        if (!cancelled) {
          setTables(describeTables(db, lesson.tables));
          setTableData(Object.fromEntries(lesson.tables.map((name) => [name, readTable(db, name)])));
        }
        db.close();
      })
      .catch((err) => {
        console.error("Couldn't start the SQL engine:", err);
        if (!cancelled) setLoadError("We couldn't start the practice database. Try refreshing the page.");
      });
    return () => {
      cancelled = true;
      clearTimeout(timer.current);
      dbRef.current?.close();
    };
  }, [lesson, setupSql]);

  // Every task starts with a fresh copy of the data, plus the expected result
  async function openTask(index: number) {
    const t = lesson.tasks[index];
    const [db, answerDb] = await Promise.all([createDatabase(setupSql), createDatabase(setupSql)]);
    dbRef.current?.close();
    dbRef.current = db;
    setExpected(t.type === "write" ? runQuery(answerDb, t.answer) : null);
    answerDb.close();

    clearTimeout(timer.current);
    setCooling(false);
    setTaskIndex(index);
    setTs(FRESH_TASK);
    setCode(t.type === "predict" ? t.code : "");
    setResult(null);
    setSqlError("");
  }

  async function handleGotIt() {
    await openTask(0);
    setStarted(true);
  }

  async function handleNext() {
    if (taskIndex === lesson.tasks.length - 1) {
      setFinished(true);
      markComplete(lesson.id);
    } else {
      await openTask(taskIndex + 1);
    }
  }

  function solve(text: string) {
    clearTimeout(timer.current);
    setCooling(false);
    setTs((s) => ({ ...s, solved: true, feedback: { tone: "good", text } }));
  }

  // Help ladder: 1st miss = hint 1, 2nd = hint 2, 3rd = solution pop-up.
  // The help appears after a short pause.
  function miss(reason: string) {
    const tries = ts.wrongTries + 1;
    const hintCount = task.hints.length;
    setTs((s) => ({ ...s, wrongTries: tries, feedback: { tone: "try", text: `${nudge(tries)} ${reason}` } }));
    setCooling(true);
    clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      setCooling(false);
      setTs((s) =>
        tries <= hintCount
          ? { ...s, hintsShown: Math.max(s.hintsShown, tries) }
          : s.solutionSeen
            ? s // they've seen it already; the "Show the example again" button is there
            : { ...s, solutionOpen: true, solutionSeen: true }
      );
    }, HINT_PAUSE_MS);
  }

  function handleRun() {
    const db = dbRef.current;
    if (!started || !db || cooling) return;
    if (!code.trim()) {
      setTs((s) => ({ ...s, feedback: { tone: "try", text: "Type a query first, then press Run." } }));
      return;
    }

    let res: QueryResult | null = null;
    let error = "";
    try {
      res = runQuery(db, code);
    } catch (err) {
      error = friendlyError(err instanceof Error ? err.message : String(err));
    }
    setResult(res);
    setSqlError(error);

    // Only an unsolved "write" task is checked; otherwise the learner is just exploring
    if (finished || task.type !== "write" || ts.solved) return;
    if (!res) return miss(error);
    const check = compareResults(res, expected!, task.answer);
    if (check.match) solve("Nice work! Your result matches exactly. 🎉");
    else miss(check.reason);
  }

  function handlePick(option: string) {
    if (task.type !== "predict" || ts.solved || cooling || !dbRef.current) return;
    if (option === task.answer) {
      setResult(runQuery(dbRef.current, task.code));
      solve(`Yes! The answer is ${option}. Here's the result so you can see for yourself.`);
    } else {
      setTs((s) => ({ ...s, wrongPicks: [...s.wrongPicks, option] }));
      miss(`It isn't ${option}.`);
    }
  }

  const editorLocked = !started || (isPredict && !ts.solved);
  const canRun = started && !cooling && !(isPredict && !ts.solved);

  return (
    <div className="mt-4 grid gap-4 xl:grid-cols-[26rem_minmax(0,1fr)]">
      {/* ---------- Lesson panel ---------- */}
      <section className="flex flex-col gap-4">
        <TaskSteps count={lesson.tasks.length} current={started ? taskIndex : -1} solved={ts.solved} finished={finished} />

        {!started ? (
          <>
            <p className="leading-7">{lesson.explanation}</p>
            <div>
              <h3 className="mb-2 font-semibold">Example</h3>
              <CodeLines lines={lesson.example.lines} />
            </div>
            <button
              type="button"
              onClick={handleGotIt}
              disabled={tables.length === 0}
              className="self-start rounded-full bg-foreground px-6 py-3 font-medium text-background transition-opacity hover:opacity-80 disabled:cursor-wait disabled:opacity-40"
            >
              Got it
            </button>
          </>
        ) : finished ? (
          <LessonDone recap={lesson.recap} language={language} nextLesson={nextLesson} />
        ) : (
          <>
            <details className="rounded-xl border border-zinc-200 px-4 py-2 text-sm dark:border-zinc-800">
              <summary className="cursor-pointer font-medium">Explanation and example</summary>
              <p className="mt-2 leading-6">{lesson.explanation}</p>
              <div className="my-3">
                <CodeLines lines={lesson.example.lines} />
              </div>
            </details>

            <div className="rounded-2xl border border-zinc-200 p-4 dark:border-zinc-800">
              <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                Task {taskIndex + 1} of {lesson.tasks.length}
                {isPredict && " · Predict"}
              </p>
              <p className="mt-1 font-medium leading-7">{task.prompt}</p>

              {/* Predict tasks: show the data so learners can work out the answer */}
              {isPredict &&
                lesson.tables.map(
                  (name) =>
                    tableData[name] && (
                      <div key={name} className="mt-3">
                        <p className="mb-1 font-mono text-xs font-semibold">▦ {name}</p>
                        <div className="h-72 overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-800">
                          <ResultsGrid result={tableData[name]} />
                        </div>
                      </div>
                    )
                )}

              {task.type === "predict" && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {task.options.map((option) => {
                    const triedWrong = ts.wrongPicks.includes(option);
                    const isAnswer = ts.solved && option === task.answer;
                    return (
                      <button
                        key={option}
                        type="button"
                        onClick={() => handlePick(option)}
                        disabled={ts.solved || cooling || triedWrong}
                        className={`min-w-16 rounded-full border px-5 py-2 font-medium transition-colors disabled:cursor-not-allowed ${
                          isAnswer
                            ? "border-green-600 bg-green-50 text-green-900 dark:bg-green-950/50 dark:text-green-200"
                            : triedWrong
                              ? "border-zinc-200 text-zinc-400 line-through dark:border-zinc-800"
                              : "border-zinc-300 hover:bg-zinc-100 disabled:opacity-60 dark:border-zinc-700 dark:hover:bg-zinc-900"
                        }`}
                      >
                        {option}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {ts.feedback && <Feedback tone={ts.feedback.tone}>{ts.feedback.text}</Feedback>}
            {cooling && <p className="animate-pulse text-sm text-zinc-500">Have a think… a hint is on its way.</p>}

            {ts.hintsShown > 0 && !ts.solved && (
              <ul className="flex flex-col gap-2">
                {task.hints.slice(0, ts.hintsShown).map((hint, i) => (
                  <li key={i} className="rounded-xl bg-blue-50 px-4 py-3 text-sm text-blue-950 dark:bg-blue-950/50 dark:text-blue-100">
                    <span className="font-semibold">💡 Hint {i + 1}: </span>
                    {hint}
                  </li>
                ))}
              </ul>
            )}

            {ts.solutionSeen && !ts.solved && !cooling && (
              <button
                type="button"
                onClick={() => setTs((s) => ({ ...s, solutionOpen: true }))}
                className="self-start text-sm font-medium text-zinc-600 underline underline-offset-4 hover:text-foreground dark:text-zinc-400"
              >
                Show the example again
              </button>
            )}

            {ts.solved && (
              <button
                type="button"
                onClick={handleNext}
                className="self-start rounded-full bg-foreground px-6 py-3 font-medium text-background transition-opacity hover:opacity-80"
              >
                {taskIndex === lesson.tasks.length - 1 ? "Finish lesson" : "Next task →"}
              </button>
            )}
          </>
        )}
        {loadError && <p className="text-sm text-red-600 dark:text-red-400">{loadError}</p>}
      </section>

      {/* ---------- Workspace (like a SQL tool) ---------- */}
      <section className="flex min-h-[36rem] flex-col overflow-hidden rounded-2xl border border-zinc-200 dark:border-zinc-800">
        <div className="flex items-center gap-3 border-b border-zinc-200 bg-zinc-50 px-3 py-2 dark:border-zinc-800 dark:bg-zinc-900">
          <span className="text-sm font-medium">Query editor</span>
          <span className="hidden text-xs text-zinc-500 sm:inline">
            {editorLocked && started ? "Read-only: pick an answer first" : "Ctrl/⌘ + Enter to run"}
          </span>
          <button
            type="button"
            onClick={handleRun}
            disabled={!canRun}
            className="ml-auto rounded-md bg-blue-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            ▶ Run
          </button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col md:flex-row">
          <aside className="border-b border-zinc-200 md:w-52 md:shrink-0 md:border-b-0 md:border-r dark:border-zinc-800">
            <SchemaPanel tables={tables} onViewData={setViewing} />
          </aside>

          <div className="flex min-w-0 flex-1 flex-col">
            <div className="relative h-56 shrink-0 overflow-auto border-b border-zinc-200 dark:border-zinc-800">
              <SqlEditor value={code} onChange={setCode} onRun={handleRun} readOnly={editorLocked} />
              {!started && (
                <div className="absolute inset-0 flex items-center justify-center bg-background/80 p-6 text-center text-sm text-zinc-600 dark:text-zinc-400">
                  🔒 Read the explanation and example, then press &ldquo;Got it&rdquo; to start.
                </div>
              )}
            </div>

            <div className={`grid min-h-64 flex-1 ${!isPredict ? "lg:grid-cols-2" : ""}`}>
              <ResultPane title={isPredict ? "Result" : "Your result"}>
                {sqlError ? (
                  <p className="p-4 text-sm text-amber-800 dark:text-amber-300">{sqlError}</p>
                ) : result ? (
                  <ResultsGrid result={result} />
                ) : (
                  <p className="p-4 text-sm text-zinc-500">
                    {isPredict && started ? "Pick an answer to see the result." : "Run your query to see the result here."}
                  </p>
                )}
              </ResultPane>
              {!isPredict && started && expected && (
                <ResultPane title="Expected result" className="border-t lg:border-l lg:border-t-0">
                  <ResultsGrid result={expected} />
                </ResultPane>
              )}
            </div>
          </div>
        </div>
      </section>

      {viewing && tableData[viewing] && (
        <TablePreviewModal name={viewing} data={tableData[viewing]} onClose={() => setViewing(null)} />
      )}
      {ts.solutionOpen && (
        <SolutionModal
          lines={task.solution_lines}
          onClose={() => setTs((s) => ({ ...s, solutionOpen: false }))}
        />
      )}
    </div>
  );
}

function ResultPane({
  title,
  className = "",
  children,
}: {
  title: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`flex min-h-0 min-w-0 flex-col border-zinc-200 dark:border-zinc-800 ${className}`}>
      <p className="border-b border-zinc-200 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:border-zinc-800">
        {title}
      </p>
      <div className="max-h-80 min-h-0 flex-1 overflow-hidden">{children}</div>
    </div>
  );
}

// Row of task markers: done ✓, current, or locked
function TaskSteps({ count, current, solved, finished }: { count: number; current: number; solved: boolean; finished: boolean }) {
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
                  : "bg-zinc-100 text-zinc-400 dark:bg-zinc-900"
            }`}
          >
            {done ? "✓" : i > current ? "🔒" : i + 1}
          </li>
        );
      })}
    </ol>
  );
}
