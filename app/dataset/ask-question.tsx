"use client"; // handles typing, submitting, and showing the answer in the browser

import { useMemo, useState } from "react";
import type { Dataset } from "@/lib/parse-dataset";
import type { Analysis, AskRequest } from "@/lib/analysis-schema";
import {
  buildChartData,
  computeStat,
  profileColumns,
  rowsForPrompt,
} from "@/lib/dataset-stats";
import { saveAnswer, type Answer } from "@/lib/history";
import { useDataset } from "../dataset-context";
import AnalysisChart from "./analysis-chart";

// Question box shown under the dataset table. Sends the question to the AI,
// then computes the AI's requested stats and charts from the full dataset.
// Every question and answer stays listed above the box (and is saved for logged-in users).
export default function AskQuestion({ dataset }: { dataset: Dataset }) {
  const { analysisId, answers, addAnswer } = useDataset();
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [saveError, setSaveError] = useState("");

  // Column summary + rows for the AI. Computed once per dataset, not per question.
  const promptData = useMemo(
    () => ({ profile: profileColumns(dataset), ...rowsForPrompt(dataset) }),
    [dataset]
  );

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = question.trim();
    if (!trimmed || loading) return;

    setLoading(true);
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
      setLoading(false);
    }
  }

  return (
    <section className="mx-auto mt-12 w-full max-w-3xl">
      <h2 className="text-2xl font-bold tracking-tight">
        Curious about your data? Ask me anything 👋
      </h2>
      <p className="mt-2 text-zinc-600 dark:text-zinc-400">
        For example — &ldquo;What trends stand out?&rdquo; or &ldquo;Which
        category sold the most?&rdquo;
      </p>

      {/* Every question asked so far, oldest first */}
      {answers.length > 0 && (
        <div className="mt-8 flex flex-col gap-10">
          {answers.map((answer, i) => (
            <AnswerView key={i} answer={answer} />
          ))}
        </div>
      )}

      <div aria-live="polite">
        {loading && (
          <p className="mt-6 animate-pulse text-zinc-600 dark:text-zinc-400">
            Looking through your data… this usually takes a few seconds. ✨
          </p>
        )}

        {error && !loading && (
          <p role="alert" className="mt-6 text-sm text-red-600 dark:text-red-400">
            {error}
          </p>
        )}

        {saveError && (
          <p role="status" className="mt-4 text-sm text-amber-700 dark:text-amber-400">
            {saveError}
          </p>
        )}
      </div>

      <form onSubmit={handleSubmit} className="mt-8 flex flex-col gap-3 sm:flex-row">
        <input
          type="text"
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          placeholder="Type your question here..."
          aria-label="Your question about the dataset"
          maxLength={1000}
          className="flex-1 rounded-full border border-zinc-300 bg-transparent px-5 py-3 outline-none focus:border-foreground dark:border-zinc-700"
        />
        <button
          type="submit"
          disabled={!question.trim() || loading}
          className="rounded-full bg-foreground px-6 py-3 font-medium text-background transition-opacity hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {loading ? "Thinking..." : "Ask Analyzely"}
        </button>
      </form>

      {promptData.isSample && (
        <p className="mt-3 text-xs text-zinc-500">
          Your file is large, so I&rsquo;ll read a sample of{" "}
          {promptData.rows.length} rows plus a summary of every column. Charts
          and numbers are always calculated from all{" "}
          {dataset.rows.length.toLocaleString()} rows.
        </p>
      )}
    </section>
  );
}

function AnswerView({ answer }: { answer: Answer }) {
  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-2xl bg-zinc-100 p-5 dark:bg-zinc-900">
        <p className="text-sm text-zinc-500">You asked</p>
        <p className="mt-1 text-lg font-medium">{answer.question}</p>
        <div className="mt-4 flex flex-col gap-3 leading-7">
          {answer.analysis.split(/\n\s*\n/).map((paragraph, i) => (
            <p key={i}>{paragraph}</p>
          ))}
        </div>
      </div>

      {answer.stats.length > 0 && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {answer.stats.map((stat, i) => (
            <div key={i} className="rounded-2xl border border-zinc-200 p-4 dark:border-zinc-800">
              <p className="text-sm text-zinc-600 dark:text-zinc-400">{stat.label}</p>
              <p className="mt-1 text-2xl font-semibold">{stat.value}</p>
              {stat.detail && <p className="mt-1 text-xs text-zinc-500">{stat.detail}</p>}
            </div>
          ))}
        </div>
      )}

      {answer.charts.map((chart, i) => (
        <AnalysisChart key={i} chart={chart} />
      ))}
    </div>
  );
}
