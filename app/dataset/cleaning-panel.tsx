"use client";

import type { Dataset } from "@/lib/parse-dataset";
import type { Issue } from "@/lib/cleaning";
import { downloadCsv } from "@/lib/csv";
import { useDataset } from "../dataset-context";
import { IssueCard } from "./issue-card";

// Summary above the table: how many issues, Fix all / Restore, downloads, and the full list
export default function CleaningPanel({
  dataset,
  cleaned,
  onShowIssue,
}: {
  dataset: Dataset; // the original
  cleaned: Dataset; // the original with applied fixes
  onShowIssue: (issue: Issue) => void;
}) {
  const { cleaning, cleaningStatus, cleaningNote, cleaningSaveFailed, setFixed, restoreOriginal } =
    useDataset();
  const scanning = cleaningStatus === "scanning";

  if (!cleaning) {
    return (
      <p className="mt-6 animate-pulse text-sm text-zinc-600 dark:text-zinc-400">
        Checking your data for problems…
      </p>
    );
  }

  const { issues } = cleaning;
  const fixed = new Set(cleaning.fixedIds);
  const fixable = issues.filter((issue) => issue.fix);
  const allFixed = fixable.every((issue) => fixed.has(issue.id));
  const baseName = dataset.fileName.replace(/\.(csv|xlsx)$/i, "");

  const buttonClass =
    "rounded-full border border-zinc-300 px-4 py-2 text-sm font-medium hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-40 dark:border-zinc-700 dark:hover:bg-zinc-800";

  return (
    <section className="mt-6 rounded-2xl border border-zinc-200 p-5 dark:border-zinc-800">
      <h2 className="text-lg font-semibold">
        {issues.length === 0
          ? "No problems found. Your data looks clean ✨"
          : `We found ${issues.length.toLocaleString()} possible ${issues.length === 1 ? "issue" : "issues"}.`}
        {fixed.size > 0 && (
          <span className="ml-2 text-base font-normal text-green-700 dark:text-green-400">
            {fixed.size.toLocaleString()} fixed
          </span>
        )}
      </h2>

      {scanning ? (
        <p className="mt-1 animate-pulse text-sm text-zinc-600 dark:text-zinc-400">
          Our AI is double-checking these and working out the best fixes…
        </p>
      ) : (
        issues.length > 0 && (
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            <span className="text-red-700 dark:text-red-400">Red</span> cells may have a problem,{" "}
            <span className="text-green-700 dark:text-green-400">green</span> cells are fixed. Hover
            a cell for details. Your original data is always kept.
          </p>
        )
      )}

      {cleaningNote && (
        <p role="status" className="mt-2 text-sm text-amber-700 dark:text-amber-400">
          {cleaningNote}
        </p>
      )}
      {cleaningSaveFailed && (
        <p role="status" className="mt-2 text-sm text-amber-700 dark:text-amber-400">
          We couldn&rsquo;t save your fixes to your history, but they&rsquo;re still here for now.
        </p>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        {fixable.length > 0 && (
          <button
            type="button"
            onClick={() => setFixed(fixable.map((issue) => issue.id), true)}
            disabled={scanning || allFixed}
            className="rounded-full bg-foreground px-4 py-2 text-sm font-medium text-background transition-opacity hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Fix all ({fixable.length.toLocaleString()})
          </button>
        )}
        {fixable.length > 0 && (
          <button type="button" onClick={restoreOriginal} disabled={fixed.size === 0} className={buttonClass}>
            Restore original
          </button>
        )}
        <button
          type="button"
          onClick={() => downloadCsv(`${baseName}-cleaned.csv`, cleaned.headers, cleaned.rows)}
          disabled={scanning}
          className={buttonClass}
        >
          Download cleaned CSV
        </button>
        <button
          type="button"
          onClick={() => downloadCsv(`${baseName}-original.csv`, dataset.headers, dataset.rows)}
          className={buttonClass}
        >
          Download original CSV
        </button>
      </div>

      {issues.length > 0 && (
        <details className="mt-4">
          <summary className="cursor-pointer text-sm font-medium">See all issues</summary>
          <ul className="mt-3 flex max-h-96 flex-col divide-y divide-zinc-200 overflow-y-auto dark:divide-zinc-800">
            {issues.map((issue) => (
              <li key={issue.id} className="py-3">
                <p className="mb-1 text-xs text-zinc-500">
                  Row {issue.row + 1}
                  {issue.col !== null && ` · ${dataset.headers[issue.col]}`}
                </p>
                <IssueCard
                  issue={issue}
                  original={issue.col === null ? "" : dataset.rows[issue.row][issue.col]}
                  fixed={fixed.has(issue.id)}
                  canFix={!scanning}
                  onToggle={() => setFixed([issue.id], !fixed.has(issue.id))}
                >
                  <button
                    type="button"
                    onClick={() => onShowIssue(issue)}
                    className="rounded-full px-3 py-1 text-xs font-medium text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
                  >
                    Show in table
                  </button>
                </IssueCard>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
