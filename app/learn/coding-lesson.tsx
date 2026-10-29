"use client";

import { useEffect, useRef, useState } from "react";
import type { Database } from "sql.js";
import type { CodingLesson, LessonSummary } from "@/lib/learn/lesson-types";
import {
  compareResults,
  countChanges,
  createDatabase,
  describeTables,
  readTable,
  runQuery,
  type QueryResult,
  type TableInfo,
} from "@/lib/learn/sql/runner";
import ResultsGrid from "./results-grid";
import SchemaPanel from "./schema-panel";
import CodeEditor from "./code-editor";
import { LessonDone, SolutionModal, TablePreviewModal } from "./lesson-parts";
import {
  ExplanationRecall,
  LessonIntro,
  PredictOptions,
  ResultPane,
  TaskHelp,
  TaskSteps,
  useTaskFlow,
} from "./task-flow";

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
  const flow = useTaskFlow(lesson);
  const { started, taskIndex, task, finished, ts, cooling } = flow;
  const [code, setCode] = useState("");
  const [result, setResult] = useState<QueryResult | null>(null);
  const [sqlError, setSqlError] = useState("");
  const [expected, setExpected] = useState<QueryResult | null>(null);
  const [tables, setTables] = useState<TableInfo[]>([]);
  const [tableData, setTableData] = useState<Record<string, QueryResult>>({}); // full tables, for previews
  const [viewing, setViewing] = useState<string | null>(null); // table open in the preview pop-up
  const [loadError, setLoadError] = useState("");
  const dbRef = useRef<Database | null>(null);
  const running = useRef(false); // stops double runs while a fresh copy is being made

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
      dbRef.current?.close();
    };
  }, [lesson, setupSql]);

  // Every task starts with a fresh copy of the data, plus the expected result.
  // Tasks with a "check" query (code that changes data): run the answer, then the check.
  async function openTask(index: number) {
    const t = lesson.tasks[index];
    const [db, answerDb] = await Promise.all([createDatabase(setupSql), createDatabase(setupSql)]);
    dbRef.current?.close();
    dbRef.current = db;
    if (t.type !== "write") setExpected(null);
    else if (t.check) {
      runQuery(answerDb, t.answer);
      setExpected(runQuery(answerDb, t.check));
    } else setExpected(runQuery(answerDb, t.answer));
    answerDb.close();

    flow.goToTask(index);
    setCode(t.type === "predict" ? t.code : "");
    setResult(null);
    setSqlError("");
  }

  async function handleGotIt() {
    await openTask(0);
    flow.setStarted(true);
  }

  async function handleNext() {
    if (flow.isLastTask) flow.finishLesson();
    else await openTask(taskIndex + 1);
  }

  // Runs code that changes data on a brand-new copy, then shows the check query's result.
  // `peek` is true when the code didn't change anything and returned its own table (a SELECT).
  async function runWithCheck(sql: string, checkSql: string): Promise<{ result: QueryResult; peek: boolean }> {
    const db = await createDatabase(setupSql);
    try {
      const before = countChanges(db);
      const own = runQuery(db, sql);
      if (countChanges(db) === before && own.columns.length > 0) return { result: own, peek: true };
      return { result: runQuery(db, checkSql), peek: false };
    } finally {
      db.close();
    }
  }

  async function handleRun() {
    const db = dbRef.current;
    if (!started || !db || cooling || running.current) return;
    if (!code.trim()) {
      flow.say("Type a query first, then press Run.");
      return;
    }

    let res: QueryResult | null = null;
    let peek = false;
    let error = "";
    running.current = true;
    try {
      if (task.check) ({ result: res, peek } = await runWithCheck(code, task.check));
      else res = runQuery(db, code);
    } catch (err) {
      error = friendlyError(err instanceof Error ? err.message : String(err));
    } finally {
      running.current = false;
    }
    setResult(res);
    setSqlError(error);

    // Only an unsolved "write" task is checked; otherwise the learner is just exploring
    if (finished || task.type !== "write" || ts.solved) return;
    if (peek) {
      // Looking before changing is what the lesson recommends, so it doesn't count as a try
      flow.say(
        "That only looked at the data, so nothing changed yet. Good idea to check first! Now write the code that makes the change."
      );
      return;
    }
    if (!res) return flow.miss(error);
    const check = compareResults(res, expected!, task.check ?? task.answer);
    if (check.match) flow.solve("Nice work! Your result matches exactly. 🎉");
    else flow.miss(check.reason);
  }

  async function handlePick(option: string) {
    if (task.type !== "predict" || ts.solved || cooling || !dbRef.current) return;
    if (option === task.answer) {
      setResult(task.check ? (await runWithCheck(task.code, task.check)).result : runQuery(dbRef.current, task.code));
      flow.solve(`Yes! The answer is ${option}. Here's the result so you can see for yourself.`);
    } else {
      flow.missPick(option);
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
          <LessonIntro
            explanation={lesson.explanation}
            exampleLines={lesson.example.lines}
            ready={tables.length > 0}
            onGotIt={handleGotIt}
          />
        ) : finished ? (
          <LessonDone recap={lesson.recap} language={language} nextLesson={nextLesson} />
        ) : (
          <>
            <ExplanationRecall explanation={lesson.explanation} exampleLines={lesson.example.lines} />

            <div className="rounded-2xl border border-zinc-200 p-4">
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
                        <div className="h-72 overflow-hidden rounded-xl border border-zinc-200">
                          <ResultsGrid result={tableData[name]} />
                        </div>
                      </div>
                    )
                )}

              {task.type === "predict" && (
                <PredictOptions options={task.options} answer={task.answer} flow={flow} onPick={handlePick} />
              )}
            </div>

            <TaskHelp flow={flow} onNext={handleNext} />
          </>
        )}
        {loadError && <p className="text-sm text-red-600">{loadError}</p>}
      </section>

      {/* ---------- Workspace (like a SQL tool) ---------- */}
      <section className="flex min-h-[36rem] flex-col overflow-hidden rounded-2xl border border-zinc-200">
        <div className="flex items-center gap-3 border-b border-zinc-200 bg-zinc-50 px-3 py-2">
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
          <aside className="border-b border-zinc-200 md:w-52 md:shrink-0 md:border-b-0 md:border-r">
            <SchemaPanel tables={tables} onViewData={setViewing} />
          </aside>

          <div className="flex min-w-0 flex-1 flex-col">
            <div className="relative h-56 shrink-0 overflow-auto border-b border-zinc-200">
              <CodeEditor language="sql" value={code} onChange={setCode} onRun={handleRun} readOnly={editorLocked} />
              {!started && (
                <div className="absolute inset-0 flex items-center justify-center bg-background/80 p-6 text-center text-sm text-zinc-600">
                  🔒 Read the explanation and example, then press &ldquo;Got it&rdquo; to start.
                </div>
              )}
            </div>

            <div className={`grid min-h-64 flex-1 ${!isPredict ? "lg:grid-cols-2" : ""}`}>
              <ResultPane title={isPredict ? "Result" : task.check ? "Table after your code" : "Your result"}>
                {sqlError ? (
                  <p className="p-4 text-sm text-amber-800">{sqlError}</p>
                ) : result ? (
                  <ResultsGrid result={result} />
                ) : (
                  <p className="p-4 text-sm text-zinc-500">
                    {isPredict && started ? "Pick an answer to see the result." : "Run your query to see the result here."}
                  </p>
                )}
              </ResultPane>
              {!isPredict && started && expected && (
                <ResultPane title={task.check ? "Expected table" : "Expected result"} className="border-t lg:border-l lg:border-t-0">
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
          onClose={() => flow.setSolutionOpen(false)}
        />
      )}
    </div>
  );
}
