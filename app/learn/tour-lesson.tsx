"use client";

import { useEffect, useRef, useState } from "react";
import type { LessonSummary, QuizAnswer, TourLesson, TourTarget } from "@/lib/learn/lesson-types";
import { createDatabase, readTable, type QueryResult } from "@/lib/learn/sql/runner";
import { useLearnProgress } from "./progress-context";
import { Feedback, LessonDone, nudge } from "./lesson-parts";

const TARGET_LABELS: Record<TourTarget, string> = {
  table: "Table",
  column_header: "Column",
  row: "Row",
  cell: "Value",
  null_cell: "NULL value",
};

const QUIZ_PAUSE_MS = 1000; // short pause after a miss, so clicks can't be spammed

// What the mouse is over: a part of the table, plus which row/column (row is 1-based)
type Spot = { target: TourTarget; row?: number; col?: number };
// What the learner clicked in the quiz
type Click = { row?: number; column?: string };

function isCorrect(answer: QuizAnswer, click: Click) {
  if (answer.column !== undefined && click.column !== answer.column) return false;
  if (answer.row !== undefined && click.row !== answer.row) return false;
  if (answer.rows !== undefined && (click.row === undefined || !answer.rows.includes(click.row))) return false;
  return true;
}

// Lesson 0 style: no code. Hover parts of a table to learn their names, then a click quiz.
export default function TourLessonPlayer({
  lesson,
  setupSql,
  language,
  nextLesson,
}: {
  lesson: TourLesson;
  setupSql: string;
  language: string;
  nextLesson: LessonSummary | null;
}) {
  const { markComplete } = useLearnProgress();
  const tableName = lesson.tables[0];
  const [data, setData] = useState<QueryResult | null>(null);
  const [loadError, setLoadError] = useState("");
  const [phase, setPhase] = useState<"explore" | "quiz" | "done">("explore");
  const [hover, setHover] = useState<Spot | null>(null);
  const [explored, setExplored] = useState<Set<TourTarget>>(new Set());
  const [quizIndex, setQuizIndex] = useState(0);
  const [misses, setMisses] = useState(0);
  const [answered, setAnswered] = useState(false);
  const [cooling, setCooling] = useState(false);
  const [feedback, setFeedback] = useState<{ tone: "good" | "try"; text: string } | null>(null);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    createDatabase(setupSql)
      .then((db) => {
        if (!cancelled) setData(readTable(db, tableName));
        db.close();
      })
      .catch((err) => {
        console.error("Couldn't start the SQL engine:", err);
        if (!cancelled) setLoadError("We couldn't load the table. Try refreshing the page.");
      });
    return () => {
      cancelled = true;
      clearTimeout(timer.current);
    };
  }, [setupSql, tableName]);

  const explainFor = new Map(lesson.tour.map((t) => [t.target, t.explain]));
  const allExplored = lesson.tour.every((t) => explored.has(t.target));
  const question = lesson.quiz[quizIndex];

  function handleHover(spot: Spot) {
    setHover(spot);
    if (phase === "explore" && explainFor.has(spot.target) && !explored.has(spot.target)) {
      setExplored((prev) => new Set(prev).add(spot.target));
    }
  }

  // Describes what they clicked, so a miss still teaches something
  function describe(click: Click) {
    if (!data) return "";
    const titleCol = data.columns.indexOf("title");
    const name = (row: number) => (titleCol >= 0 ? String(data.rows[row - 1][titleCol]) : `row ${row}`);
    if (click.row !== undefined && click.column === undefined) {
      return titleCol >= 0 ? `That's the row for ${name(click.row)}.` : `That's row ${click.row}.`;
    }
    if (click.row === undefined) return `That's the ${click.column} column.`;
    const value = data.rows[click.row - 1][data.columns.indexOf(click.column!)];
    return `That's the ${click.column} of ${name(click.row)}${value === null ? ", which is NULL" : ""}.`;
  }

  function handleClick(click: Click) {
    if (phase !== "quiz" || answered || cooling) return;
    if (isCorrect(question.answer, click)) {
      setAnswered(true);
      setFeedback({ tone: "good", text: "Yes, that's it! 🎉" });
      return;
    }
    const n = misses + 1;
    setMisses(n);
    setFeedback({ tone: "try", text: `${nudge(n)} ${describe(click)}` });
    setCooling(true);
    clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setCooling(false), QUIZ_PAUSE_MS);
  }

  function handleNextQuestion() {
    if (quizIndex === lesson.quiz.length - 1) {
      setPhase("done");
      markComplete(lesson.id);
    } else {
      setQuizIndex(quizIndex + 1);
      setAnswered(false);
      setMisses(0);
      setFeedback(null);
    }
  }

  // Shading for whatever part of the table the mouse is over
  const shade = "bg-blue-100 dark:bg-blue-950/60";
  const isLit = (row: number, col: number | null) =>
    hover !== null &&
    ((hover.target === "row" && hover.row === row) ||
      (hover.target === "column_header" && hover.col === col) ||
      ((hover.target === "cell" || hover.target === "null_cell") && hover.row === row && hover.col === col));
  const clickable = phase === "quiz" ? "cursor-pointer" : "cursor-help";

  return (
    <div className="mt-4 grid gap-4 xl:grid-cols-[26rem_minmax(0,1fr)]">
      {/* ---------- Lesson panel ---------- */}
      <section className="flex flex-col gap-4">
        {phase === "explore" && (
          <>
            <p className="leading-7">{lesson.explanation}</p>
            <div className="min-h-24 rounded-xl border border-zinc-200 px-4 py-3 text-sm dark:border-zinc-800" aria-live="polite">
              {hover && explainFor.has(hover.target) ? (
                <>
                  <p className="font-semibold">{TARGET_LABELS[hover.target]}</p>
                  <p className="mt-1 leading-6">{explainFor.get(hover.target)}</p>
                </>
              ) : (
                <p className="text-zinc-500">
                  Hover over the table name, a column name, a row number, a value, and a blank (NULL) value.
                </p>
              )}
            </div>
            <ul className="flex flex-wrap gap-2" aria-label="Parts explored">
              {lesson.tour.map((t) => (
                <li
                  key={t.target}
                  className={`rounded-full px-3 py-1 text-xs font-medium ${
                    explored.has(t.target)
                      ? "bg-green-100 text-green-900 dark:bg-green-950/60 dark:text-green-200"
                      : "bg-zinc-100 text-zinc-500 dark:bg-zinc-900"
                  }`}
                >
                  {explored.has(t.target) ? "✓ " : ""}
                  {TARGET_LABELS[t.target]}
                </li>
              ))}
            </ul>
            <button
              type="button"
              onClick={() => {
                setPhase("quiz");
                setHover(null);
              }}
              disabled={!allExplored}
              className="self-start rounded-full bg-foreground px-6 py-3 font-medium text-background transition-opacity hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {allExplored ? "Got it, start the quiz" : `Explore all ${lesson.tour.length} parts to continue`}
            </button>
          </>
        )}

        {phase === "quiz" && (
          <>
            <div className="rounded-2xl border border-zinc-200 p-4 dark:border-zinc-800">
              <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                Question {quizIndex + 1} of {lesson.quiz.length}
              </p>
              <p className="mt-1 font-medium leading-7">{question.prompt}</p>
            </div>
            {feedback && <Feedback tone={feedback.tone}>{feedback.text}</Feedback>}
            {answered && (
              <button
                type="button"
                onClick={handleNextQuestion}
                className="self-start rounded-full bg-foreground px-6 py-3 font-medium text-background transition-opacity hover:opacity-80"
              >
                {quizIndex === lesson.quiz.length - 1 ? "Finish lesson" : "Next question →"}
              </button>
            )}
          </>
        )}

        {phase === "done" && <LessonDone recap={lesson.recap} language={language} nextLesson={nextLesson} />}
        {loadError && <p className="text-sm text-red-600 dark:text-red-400">{loadError}</p>}
      </section>

      {/* ---------- The table ---------- */}
      <section className="min-w-0" onMouseLeave={() => setHover(null)}>
        {data && (
          <div
            className={`inline-block max-w-full overflow-hidden rounded-2xl border-2 ${
              hover?.target === "table" ? "border-blue-500" : "border-zinc-200 dark:border-zinc-800"
            }`}
          >
            <div
              onMouseEnter={() => handleHover({ target: "table" })}
              className={`border-b border-zinc-200 bg-zinc-50 px-4 py-2 font-mono text-sm font-semibold dark:border-zinc-800 dark:bg-zinc-900 ${
                phase === "explore" ? "cursor-help" : ""
              } ${hover?.target === "table" ? shade : ""}`}
            >
              ▦ {tableName}
            </div>
            <div className="overflow-auto">
              <table className="border-collapse font-mono text-xs">
                <thead>
                  <tr>
                    <th className="border-b border-r border-zinc-200 px-2 py-1.5 text-zinc-400 dark:border-zinc-800">#</th>
                    {data.columns.map((column, c) => (
                      <th
                        key={column}
                        onMouseEnter={() => handleHover({ target: "column_header", col: c })}
                        onClick={() => handleClick({ column })}
                        className={`whitespace-nowrap border-b border-r border-zinc-200 px-3 py-1.5 text-left font-semibold dark:border-zinc-800 ${clickable} ${
                          isLit(-1, c) ? shade : "bg-zinc-100 dark:bg-zinc-900"
                        }`}
                      >
                        {column}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((values, r) => {
                    const row = r + 1;
                    return (
                      <tr key={row}>
                        <td
                          onMouseEnter={() => handleHover({ target: "row", row })}
                          onClick={() => handleClick({ row })}
                          className={`border-r border-zinc-200 px-2 py-1 text-right text-zinc-400 dark:border-zinc-800 ${clickable} ${
                            isLit(row, null) ? shade : ""
                          }`}
                        >
                          {row}
                        </td>
                        {values.map((value, c) => (
                          <td
                            key={c}
                            onMouseEnter={() => handleHover({ target: value === null ? "null_cell" : "cell", row, col: c })}
                            onClick={() => handleClick({ row, column: data.columns[c] })}
                            className={`whitespace-nowrap border-r border-zinc-200 px-3 py-1 dark:border-zinc-800 ${clickable} ${
                              isLit(row, c) ? shade : ""
                            }`}
                          >
                            {value === null ? <span className="italic text-zinc-400">NULL</span> : String(value)}
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
