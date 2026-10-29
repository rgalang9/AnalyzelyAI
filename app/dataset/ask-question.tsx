"use client"; // handles typing, submitting, and showing the answer in the browser

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { ArrowUp, Check, CircleAlert, Copy, ImageDown } from "lucide-react";
import type { Dataset } from "@/lib/parse-dataset";
import type { Analysis, AskRequest } from "@/lib/analysis-schema";
import {
  buildChartData,
  computeStat,
  profileColumns,
  rowsForPrompt,
} from "@/lib/dataset-stats";
import { saveAnswer, type Answer } from "@/lib/history";
import { safeFileName } from "@/lib/download";
import { useDataset } from "../dataset-context";
import AnalysisChart, { saveChartPng } from "./analysis-chart";

// Fixed starter questions above the box (no AI call needed to come up with them)
const SUGGESTIONS = [
  { text: "Summarize this dataset", className: "bg-purple-light text-purple" },
  { text: "What trends stand out?", className: "bg-pink-light text-pink" },
  { text: "Are there any outliers?", className: "bg-orange-light text-orange-dark" },
];

// The Ask tab, laid out like a chat. Sends the question to the AI, then computes the
// AI's requested stats and charts from the full dataset. Every question and answer stays
// listed above the box (and is saved for logged-in users).
export default function AskQuestion({ dataset }: { dataset: Dataset }) {
  const { analysisId, answers, addAnswer } = useDataset();
  const [question, setQuestion] = useState("");
  const [pending, setPending] = useState(""); // the question being answered right now
  const [error, setError] = useState("");
  const [saveError, setSaveError] = useState("");
  const endRef = useRef<HTMLDivElement>(null);
  const loading = pending !== "";

  // Column summary + rows for the AI. Computed once per dataset, not per question.
  const promptData = useMemo(
    () => ({ profile: profileColumns(dataset), ...rowsForPrompt(dataset) }),
    [dataset]
  );

  // Keep the newest message in view, like a chat
  useEffect(() => {
    if (pending || answers.length) endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [pending, answers.length]);

  async function ask(text: string) {
    const trimmed = text.trim();
    if (!trimmed || loading) return;

    setPending(trimmed);
    setError("");
    setSaveError("");

    const body: AskRequest = {
      question: trimmed,
      fileName: dataset.fileName,
      totalRows: dataset.rows.length,
      headers: dataset.headers,
      ...promptData,
    };

    try {
      const response = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const result = await response.json();

      if (!response.ok) {
        setError(result.error ?? "Something went wrong. Please try again.");
        return;
      }

      // Turn the AI's chart/stat requests into real numbers from every row.
      // Anything that doesn't match the data (e.g. a wrong column name) is skipped.
      const ai = result as Analysis;
      const answer: Answer = {
        question: trimmed,
        analysis: ai.analysis,
        stats: ai.stats.map((s) => computeStat(dataset, s)).filter((s) => s !== null),
        charts: ai.charts
          .slice(0, 2)
          .map((c) => buildChartData(dataset, c))
          .filter((c) => c !== null),
      };
      addAnswer(answer);
      setQuestion(""); // clear the box, ready for the next question

      // Save to history in the background (only when this analysis is saved, i.e. logged in)
      if (analysisId) {
        saveAnswer(analysisId, answer).catch((err) => {
          console.error("Couldn't save answer:", err);
          setSaveError("We couldn't save that answer to your history, but it's still here for now.");
        });
      }
    } catch {
      setError("I couldn't reach the server. Please check your connection and try again.");
    } finally {
      setPending("");
    }
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void ask(question);
  }

  return (
    <section className="mx-auto flex w-full max-w-4xl flex-1 flex-col text-navy">
      <div className="flex flex-1 flex-col gap-6 pb-6">
        {answers.length === 0 && !loading && (
          <div className="flex flex-col items-center rounded-2xl bg-white px-6 py-10 text-center shadow-[0_8px_30px_rgba(36,23,79,0.06)]">
            <Image src="/logo.png" alt="" width={55} height={48} className="h-12 w-auto" />
            <h2 className="mt-4 font-display text-2xl font-extrabold">Ask anything about your data</h2>
            <p className="mt-2 max-w-md text-grey">
              Type a question in plain English, or tap one of the suggestions below. Answers come
              with numbers and charts worked out from every row.
            </p>
          </div>
        )}

        {/* Every question asked so far, oldest first */}
        {answers.map((answer, i) => (
          <AnswerView key={i} answer={answer} />
        ))}

        {/* The question being answered right now */}
        <div aria-live="polite" className="flex flex-col gap-6">
          {loading && (
            <>
              <QuestionBubble text={pending} />
              <div className="flex items-center gap-3 rounded-2xl bg-white p-5 shadow-[0_8px_30px_rgba(36,23,79,0.06)]">
                <Image src="/logo.png" alt="" width={28} height={24} className="h-6 w-auto animate-pulse" />
                <p className="animate-pulse text-grey">
                  Looking through your data… this usually takes a few seconds.
                </p>
              </div>
            </>
          )}

          {error && !loading && (
            <p role="alert" className="flex items-start gap-2 rounded-xl bg-pink-light px-4 py-3 text-sm">
              <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-pink" />
              {error}
            </p>
          )}

          {saveError && (
            <p role="status" className="rounded-xl bg-orange-light px-4 py-3 text-sm">
              {saveError}
            </p>
          )}
        </div>
        <div ref={endRef} />
      </div>

      {/* Sticks to the bottom of the screen like a chat box. Same tint as the page behind it. */}
      <div className="sticky bottom-0 -mx-4 bg-white bg-linear-to-b from-purple-light/30 to-purple-light/30 px-4 pb-4 pt-3 sm:-mx-6 sm:px-6">
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-3 sm:mx-0 sm:flex-wrap sm:px-0">
          {SUGGESTIONS.map((s) => (
            <button
              key={s.text}
              type="button"
              onClick={() => void ask(s.text)}
              disabled={loading}
              className={`shrink-0 rounded-full px-3.5 py-1.5 text-sm font-semibold transition-opacity hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-50 ${s.className}`}
            >
              {s.text}
            </button>
          ))}
        </div>

        <form
          onSubmit={handleSubmit}
          className="flex items-center gap-2 rounded-2xl border-2 border-purple-light bg-white p-2 shadow-[0_8px_30px_rgba(36,23,79,0.08)] focus-within:border-purple"
        >
          <input
            type="text"
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            placeholder="Ask anything about your data..."
            aria-label="Your question about the dataset"
            maxLength={1000}
            className="min-w-0 flex-1 bg-transparent px-3 py-2 text-navy outline-none placeholder:text-grey/60"
          />
          <button
            type="submit"
            disabled={!question.trim() || loading}
            className="flex shrink-0 items-center gap-1 rounded-full bg-purple px-4 py-2.5 text-sm font-bold text-white shadow-[0_3px_0_var(--color-purple-dark)] transition-all active:translate-y-[2px] active:shadow-[0_1px_0_var(--color-purple-dark)] disabled:cursor-not-allowed disabled:opacity-50 sm:px-5"
          >
            {loading ? "Thinking…" : "Ask Analyzely"}
            <ArrowUp aria-hidden="true" className="size-4" />
          </button>
        </form>

        {promptData.isSample && (
          <p className="mt-2 text-xs text-grey">
            Your file is large, so I&rsquo;ll read a sample of {promptData.rows.length} rows plus a
            summary of every column. Charts and numbers are always calculated from all{" "}
            {dataset.rows.length.toLocaleString()} rows.
          </p>
        )}
      </div>
    </section>
  );
}

function QuestionBubble({ text }: { text: string }) {
  return (
    <p className="max-w-[85%] self-end whitespace-pre-wrap rounded-2xl rounded-br-md bg-purple px-5 py-3 font-medium text-white">
      {text}
    </p>
  );
}

// Stat card colors take turns. Each card has its own white gap around it, so pink
// and orange never touch (color rule).
const STAT_COLORS = [
  "bg-purple-light/60 text-purple",
  "bg-purple-light/60 text-purple",
  "bg-pink-light text-pink",
  "bg-orange-light text-orange-dark",
];

function AnswerView({ answer }: { answer: Answer }) {
  const chartRefs = useRef<(HTMLElement | null)[]>([]);
  const [copied, setCopied] = useState(false);
  const [actionError, setActionError] = useState("");

  async function handleCopy() {
    setActionError("");
    try {
      await navigator.clipboard.writeText(answer.analysis);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setActionError("Your browser didn't let us copy. Try selecting the text instead.");
    }
  }

  async function handleSaveCharts() {
    setActionError("");
    try {
      for (const [i, chart] of answer.charts.entries()) {
        const figure = chartRefs.current[i];
        if (!figure) continue;
        await saveChartPng(figure, chart.title, safeFileName(chart.title || "chart", ".png"));
      }
    } catch (err) {
      console.error("Couldn't save chart:", err);
      setActionError("We couldn't save the chart. Please try again.");
    }
  }

  const actionClass =
    "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold text-grey hover:bg-purple-light/60 hover:text-navy";

  return (
    <div className="flex flex-col gap-4">
      <QuestionBubble text={answer.question} />

      <article className="rounded-2xl bg-white p-5 shadow-[0_8px_30px_rgba(36,23,79,0.06)] sm:p-7">
        <p className="flex items-center gap-2 font-display font-extrabold">
          <Image src="/logo.png" alt="" width={28} height={24} className="h-6 w-auto" />
          Analyzely
        </p>
        <div className="mt-3 flex flex-col gap-3 leading-7">
          {answer.analysis.split(/\n\s*\n/).map((paragraph, i) => (
            <p key={i}>{paragraph}</p>
          ))}
        </div>

        {answer.stats.length > 0 && (
          <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {answer.stats.map((stat, i) => (
              <div key={i} className={`rounded-2xl p-4 ${STAT_COLORS[i % STAT_COLORS.length]}`}>
                <p className="text-sm font-semibold text-grey">{stat.label}</p>
                <p className="mt-1 break-words font-display text-2xl font-extrabold">{stat.value}</p>
                {stat.detail && <p className="mt-1 text-xs text-grey">{stat.detail}</p>}
              </div>
            ))}
          </div>
        )}

        {answer.charts.length > 0 && (
          <div className="mt-6 flex flex-col gap-4">
            {answer.charts.map((chart, i) => (
              <AnalysisChart
                key={i}
                chart={chart}
                ref={(el) => {
                  chartRefs.current[i] = el;
                }}
              />
            ))}
          </div>
        )}

        <div className="mt-5 flex flex-wrap items-center gap-1 border-t border-purple-light pt-3">
          <button type="button" onClick={handleCopy} className={actionClass}>
            {copied ? (
              <Check aria-hidden="true" className="size-4 text-purple" />
            ) : (
              <Copy aria-hidden="true" className="size-4" />
            )}
            {copied ? "Copied" : "Copy"}
          </button>
          {answer.charts.length > 0 && (
            <button type="button" onClick={handleSaveCharts} className={actionClass}>
              <ImageDown aria-hidden="true" className="size-4" />
              {answer.charts.length > 1 ? "Save charts" : "Save chart"}
            </button>
          )}
          {actionError && <p className="text-sm text-pink">{actionError}</p>}
        </div>
      </article>
    </div>
  );
}
