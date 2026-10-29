"use client";

import { Sparkles } from "lucide-react";
import type { Dataset } from "@/lib/parse-dataset";
import { ISSUE_LABELS, type Issue } from "@/lib/cleaning";
import { downloadTable } from "@/lib/table-download";
import { useDataset } from "../dataset-context";
import { chunkyPurple } from "../brand";
import DownloadMenu from "../download-menu";

const short = (v: string, max = 30) => (v.length > max ? `${v.slice(0, max - 1)}…` : v);

// One line under the issue's name: what changes, or what's wrong
function issueDetail(issue: Issue, dataset: Dataset): string {
  const column = issue.col === null ? "" : dataset.headers[issue.col];
  if (issue.fix?.type === "set") {
    const original = issue.col === null ? "" : dataset.rows[issue.row][issue.col];
    return `${column} "${short(original) || "(blank)"}" → ${short(issue.fix.value) || "(blank)"}`;
  }
  return column ? `${column}: ${issue.problem}` : issue.problem;
}

// The Clean tab's side panel: how many issues, one card per issue with Fix / Undo,
// "Fix all safe issues" (confident fixes only), Restore original, and the original download (CSV or Excel)
export default function CleaningPanel({
  dataset,
  onShowIssue,
}: {
  dataset: Dataset; // the original
  onShowIssue: (issue: Issue) => void;
}) {
  const { cleaning, cleaningStatus, cleaningNote, cleaningSaveFailed, setFixed, restoreOriginal } =
    useDataset();
  const scanning = cleaningStatus === "scanning";

  if (!cleaning) {
    return (
      <section className="rounded-2xl bg-white p-5 text-navy shadow-[0_8px_30px_rgba(36,23,79,0.06)]">
        <p className="animate-pulse text-sm text-grey">Checking your data for problems…</p>
      </section>
    );
  }

  const { issues } = cleaning;
  const fixed = new Set(cleaning.fixedIds);
  const toReview = issues.length - fixed.size;
  // "Safe" = fixes we're confident about. Uncertain suggestions are left for the user to decide.
  const safeUnfixed = issues.filter((i) => i.fix && i.certainty === "confident" && !fixed.has(i.id));
  const uncertainLeft = issues.filter((i) => i.fix && i.certainty === "suggestion" && !fixed.has(i.id));
  const baseName = dataset.fileName.replace(/\.(csv|xlsx)$/i, "");

  return (
    // min-w-0 stops long issue text from stretching the panel wider than a phone screen
    <section className="flex min-w-0 flex-col rounded-2xl bg-white p-5 text-navy shadow-[0_8px_30px_rgba(36,23,79,0.06)] sm:p-6">
      <h2 className="font-display text-2xl font-extrabold tracking-tight">
        {issues.length === 0
          ? "No problems found ✨"
          : `We found ${issues.length.toLocaleString()} ${issues.length === 1 ? "issue" : "issues"}`}
      </h2>
      <p className="mt-1 text-sm text-grey">
        {issues.length === 0
          ? "Your data looks clean."
          : `${fixed.size.toLocaleString()} fixed · ${toReview.toLocaleString()} to review`}
      </p>

      {scanning && (
        <p className="mt-3 animate-pulse text-sm text-grey">
          Our AI is double-checking these and working out the best fixes…
        </p>
      )}
      {cleaningNote && (
        <p role="status" className="mt-3 rounded-xl bg-orange-light px-3 py-2 text-sm">
          {cleaningNote}
        </p>
      )}
      {cleaningSaveFailed && (
        <p role="status" className="mt-3 rounded-xl bg-orange-light px-3 py-2 text-sm">
          We couldn&rsquo;t save your fixes to your history, but they&rsquo;re still here for now.
        </p>
      )}

      {issues.length > 0 && (
        <ul className="-mx-1 mt-4 flex flex-col gap-2.5 px-1 lg:max-h-[60vh] lg:overflow-y-auto">
          {issues.map((issue) => {
            const isFixed = fixed.has(issue.id);
            return (
              <li
                key={issue.id}
                className="flex items-center gap-3 rounded-xl border border-purple-light p-3.5"
              >
                {/* Tap the text to jump to the row in the table */}
                <button
                  type="button"
                  onClick={() => onShowIssue(issue)}
                  className="min-w-0 flex-1 text-left"
                  title="Show in table"
                >
                  <span className="block text-sm font-bold">
                    {ISSUE_LABELS[issue.kind]}
                    <span className="font-normal text-grey"> · row {issue.row + 1}</span>
                  </span>
                  <span className="mt-0.5 block truncate text-xs text-grey">
                    {issueDetail(issue, dataset)}
                  </span>
                  {issue.fix && issue.certainty === "suggestion" && !isFixed && (
                    <span className="mt-1 block text-xs font-semibold text-orange-dark">
                      Not certain: check before fixing
                    </span>
                  )}
                </button>

                {issue.fix ? (
                  <button
                    type="button"
                    onClick={() => setFixed([issue.id], !isFixed)}
                    disabled={scanning}
                    aria-label={isFixed ? `Undo fix: ${ISSUE_LABELS[issue.kind]}, row ${issue.row + 1}` : undefined}
                    className={`shrink-0 rounded-full px-3.5 py-1.5 text-xs font-bold transition-opacity disabled:cursor-not-allowed disabled:opacity-40 ${
                      isFixed
                        ? "bg-green-100 text-green-800 hover:opacity-80"
                        : "bg-purple text-white hover:opacity-90"
                    }`}
                  >
                    {isFixed ? "Fixed · Undo" : "Fix"}
                  </button>
                ) : (
                  <span className="shrink-0 text-xs text-grey">Flagged only</span>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {issues.some((i) => i.fix) && (
        <div className="mt-5 flex flex-col items-center gap-2">
          <button
            type="button"
            onClick={() => setFixed(safeUnfixed.map((i) => i.id), true)}
            disabled={scanning || safeUnfixed.length === 0}
            className={`${chunkyPurple} w-full gap-2 px-6! py-3.5! text-base! disabled:cursor-not-allowed disabled:opacity-50`}
          >
            <Sparkles aria-hidden="true" className="size-5" />
            Fix all safe issues
            {safeUnfixed.length > 0 && ` (${safeUnfixed.length.toLocaleString()})`}
          </button>
          {uncertainLeft.length > 0 && (
            <p className="text-center text-xs text-grey">
              {uncertainLeft.length.toLocaleString()} uncertain{" "}
              {uncertainLeft.length === 1 ? "suggestion is" : "suggestions are"} left for you to
              check one by one.
            </p>
          )}
          <button
            type="button"
            onClick={restoreOriginal}
            disabled={fixed.size === 0}
            className="mt-1 text-sm font-bold text-navy hover:underline disabled:cursor-not-allowed disabled:opacity-40 disabled:no-underline"
          >
            Restore original
          </button>
        </div>
      )}

      <div className={issues.some((i) => i.fix) ? "mt-1 flex justify-center" : "mt-4 flex justify-center"}>
        <DownloadMenu
          label="Download original"
          variant="link"
          onPick={(format) =>
            downloadTable(format, `${baseName}-original`, dataset.fileName, dataset.headers, dataset.rows)
          }
        />
      </div>
    </section>
  );
}
