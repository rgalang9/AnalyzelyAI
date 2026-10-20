"use client"; // reads the dataset from shared browser memory and handles page clicks

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { Dataset } from "@/lib/parse-dataset";
import { applyFixes, type Issue } from "@/lib/cleaning";
import { useDataset } from "../dataset-context";
import AskQuestion from "./ask-question";
import CleaningPanel from "./cleaning-panel";
import { IssueCard, IssueTooltip } from "./issue-card";

const ROWS_PER_PAGE = 250;

export default function DatasetPage() {
  const { dataset, openCount } = useDataset();

  // No dataset in memory (e.g. the page was refreshed): send them back to upload
  if (!dataset) {
    return (
      <main className="flex flex-1 flex-col items-center justify-center gap-4 px-6 py-24 text-center">
        <p className="text-zinc-600 dark:text-zinc-400">
          No dataset loaded. Please upload a file first.
        </p>
        <Link
          href="/upload"
          className="rounded-full bg-foreground px-6 py-3 font-medium text-background hover:opacity-80"
        >
          Upload a dataset
        </Link>
      </main>
    );
  }

  // The key gives each opened dataset a fresh screen (back to page 1, empty question box)
  return <DatasetView key={openCount} dataset={dataset} />;
}

// Highlight colors for problem cells (red) and fixed cells (green)
const RED = "cursor-help bg-red-100 text-red-900 dark:bg-red-950/60 dark:text-red-200";
const GREEN = "cursor-help bg-green-100 text-green-900 dark:bg-green-950/60 dark:text-green-200";

function DatasetView({ dataset }: { dataset: Dataset }) {
  const { saveFailed, cleaning, cleaningStatus, setFixed } = useDataset();
  const [page, setPage] = useState(1);
  const [tip, setTip] = useState<{ issueId: string; anchor: DOMRect } | null>(null);
  const closeTimer = useRef<number | undefined>(undefined);
  const tableBoxRef = useRef<HTMLDivElement>(null);

  const { fileName, headers, rows } = dataset;
  const totalPages = Math.max(1, Math.ceil(rows.length / ROWS_PER_PAGE));
  const start = (page - 1) * ROWS_PER_PAGE;
  const pageRows = rows.slice(start, start + ROWS_PER_PAGE);

  // The original with the applied fixes. AI questions use this.
  const cleaned = useMemo(() => applyFixes(dataset, cleaning), [dataset, cleaning]);
  const fixedIds = useMemo(() => new Set(cleaning?.fixedIds), [cleaning]);

  // Lookups so each table cell can find its issue quickly
  const { cellIssues, rowIssues, issueById } = useMemo(() => {
    const cellIssues = new Map<string, Issue>(); // "row:col" → issue
    const rowIssues = new Map<number, Issue>(); // whole-row issues (duplicates)
    const issueById = new Map<string, Issue>();
    for (const issue of cleaning?.issues ?? []) {
      issueById.set(issue.id, issue);
      if (issue.col === null) rowIssues.set(issue.row, issue);
      else cellIssues.set(`${issue.row}:${issue.col}`, issue);
    }
    return { cellIssues, rowIssues, issueById };
  }, [cleaning]);

  // Close the tooltip when anything scrolls (it would be in the wrong place)
  useEffect(() => {
    const close = () => setTip(null);
    window.addEventListener("scroll", close, true);
    return () => {
      window.removeEventListener("scroll", close, true);
      clearTimeout(closeTimer.current);
    };
  }, []);

  function openTip(issueId: string, cell: HTMLElement) {
    clearTimeout(closeTimer.current);
    setTip({ issueId, anchor: cell.getBoundingClientRect() });
  }

  // A short delay lets the mouse move from the cell into the tooltip to click Fix
  function closeTipSoon() {
    clearTimeout(closeTimer.current);
    closeTimer.current = window.setTimeout(() => setTip(null), 150);
  }

  const tipProps = (issue: Issue) => ({
    tabIndex: 0,
    onMouseEnter: (e: React.MouseEvent<HTMLElement>) => openTip(issue.id, e.currentTarget),
    onFocus: (e: React.FocusEvent<HTMLElement>) => openTip(issue.id, e.currentTarget),
    onMouseLeave: closeTipSoon,
    onBlur: closeTipSoon,
  });

  function goToPage(newPage: number) {
    setPage(newPage);
    tableBoxRef.current?.scrollTo({ top: 0 }); // start the new page at the top
  }

  // "Show in table" from the issue list: go to the right page and scroll to the row
  function showIssue(issue: Issue) {
    goToPage(Math.floor(issue.row / ROWS_PER_PAGE) + 1);
    requestAnimationFrame(() =>
      document
        .getElementById(`data-row-${issue.row}`)
        ?.scrollIntoView({ block: "center", behavior: "smooth" })
    );
  }

  const tipIssue = tip ? issueById.get(tip.issueId) : undefined;

  return (
    <main className="flex flex-1 flex-col px-6 py-10">
      <Link href="/upload" className="text-sm text-zinc-500 hover:text-foreground">
        ← Upload a different file
      </Link>

      <h1 className="mt-4 text-2xl font-bold tracking-tight">{fileName}</h1>
      <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
        {rows.length.toLocaleString()} rows · {headers.length} columns
      </p>

      {saveFailed && (
        <p role="status" className="mt-3 text-sm text-amber-700 dark:text-amber-400">
          Heads up: we couldn&rsquo;t save this one to your history, but you can
          still explore it and ask questions.
        </p>
      )}

      <CleaningPanel dataset={dataset} cleaned={cleaned} onShowIssue={showIssue} />

      {/* Scroll box: scrolls down for many rows and sideways for many columns */}
      <div
        ref={tableBoxRef}
        className="mt-6 max-h-[70vh] overflow-auto rounded-lg border border-zinc-200 dark:border-zinc-800"
      >
        <table className="min-w-full border-collapse text-sm">
          {/* sticky keeps the headers visible while scrolling down */}
          <thead className="sticky top-0 bg-zinc-100 dark:bg-zinc-900">
            <tr>
              <th className="border-b border-zinc-200 px-3 py-2 text-right font-medium text-zinc-500 dark:border-zinc-800">
                #
              </th>
              {headers.map((header, i) => (
                <th
                  key={i}
                  className="whitespace-nowrap border-b border-zinc-200 px-3 py-2 text-left font-semibold dark:border-zinc-800"
                >
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pageRows.map((row, rowIndex) => {
              const r = start + rowIndex;
              const rowIssue = rowIssues.get(r);
              const rowFixed = rowIssue && fixedIds.has(rowIssue.id);
              return (
                <tr
                  key={r}
                  id={`data-row-${r}`}
                  className={
                    !rowIssue
                      ? "even:bg-zinc-50 dark:even:bg-zinc-900/40"
                      : rowFixed
                        ? `${GREEN} line-through`
                        : RED
                  }
                >
                  <td
                    {...(rowIssue && tipProps(rowIssue))}
                    className={`px-3 py-1.5 text-right ${rowIssue ? "font-medium" : "text-zinc-400"}`}
                  >
                    {r + 1}
                  </td>
                  {row.map((cell, i) => {
                    const issue = cellIssues.get(`${r}:${i}`);
                    if (!issue) {
                      return (
                        <td
                          key={i}
                          title={cell}
                          className="max-w-xs truncate whitespace-nowrap px-3 py-1.5"
                        >
                          {cell}
                        </td>
                      );
                    }
                    const isFixed = fixedIds.has(issue.id);
                    return (
                      <td
                        key={i}
                        {...tipProps(issue)}
                        className={`max-w-xs truncate whitespace-nowrap px-3 py-1.5 ${isFixed ? GREEN : RED}`}
                      >
                        {isFixed && issue.fix?.type === "set" ? issue.fix.value : cell}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>

        {rows.length === 0 && (
          <p className="p-6 text-center text-zinc-500">
            This file has headers but no data rows.
          </p>
        )}
      </div>

      {/* Pagination controls */}
      <div className="mt-4 flex items-center justify-center gap-4">
        <button
          onClick={() => goToPage(page - 1)}
          disabled={page === 1}
          className="rounded-full border border-zinc-300 px-5 py-2 text-sm font-medium hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-40 dark:border-zinc-700 dark:hover:bg-zinc-800"
        >
          Previous
        </button>
        <span className="text-sm text-zinc-600 dark:text-zinc-400">
          Page {page} of {totalPages}
        </span>
        <button
          onClick={() => goToPage(page + 1)}
          disabled={page === totalPages}
          className="rounded-full border border-zinc-300 px-5 py-2 text-sm font-medium hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-40 dark:border-zinc-700 dark:hover:bg-zinc-800"
        >
          Next
        </button>
      </div>

      <AskQuestion dataset={cleaned} />

      {tip && tipIssue && (
        <IssueTooltip
          anchor={tip.anchor}
          onMouseEnter={() => clearTimeout(closeTimer.current)}
          onMouseLeave={closeTipSoon}
        >
          <IssueCard
            issue={tipIssue}
            original={tipIssue.col === null ? "" : rows[tipIssue.row][tipIssue.col]}
            fixed={fixedIds.has(tipIssue.id)}
            canFix={cleaningStatus === "done"}
            onToggle={() => setFixed([tipIssue.id], !fixedIds.has(tipIssue.id))}
          />
        </IssueTooltip>
      )}
    </main>
  );
}
