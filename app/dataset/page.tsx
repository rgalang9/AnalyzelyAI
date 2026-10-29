"use client"; // reads the dataset from shared browser memory and handles page clicks

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Check, Download, MessageCircle, Sheet, Sparkles } from "lucide-react";
import type { Dataset } from "@/lib/parse-dataset";
import { applyFixes, type Issue } from "@/lib/cleaning";
import { downloadCsv } from "@/lib/csv";
import { getAnalysisTitle, HISTORY_CHANGED } from "@/lib/history";
import { useDataset } from "../dataset-context";
import { useUserEmail } from "../use-user-email";
import AskQuestion from "./ask-question";
import CleaningPanel from "./cleaning-panel";
import DataTab from "./data-tab";
import { IssueCard, IssueTooltip } from "./issue-card";

const ROWS_PER_PAGE = 250;

export default function DatasetPage() {
  const { dataset, openCount } = useDataset();

  // No dataset in memory (e.g. the page was refreshed): send them back to upload
  if (!dataset) {
    return (
      <main className="flex flex-1 flex-col items-center justify-center gap-4 px-6 py-24 text-center">
        <p className="text-zinc-600">
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
const RED = "cursor-help bg-red-100 text-red-900";
const GREEN = "cursor-help bg-green-100 text-green-900";

type Tab = "ask" | "data" | "clean";

function DatasetView({ dataset }: { dataset: Dataset }) {
  const { analysisId, saveFailed, cleaning, cleaningStatus, setFixed } = useDataset();
  const [tab, setTab] = useState<Tab>("ask");
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
  const issuesLeft = cleaning ? cleaning.issues.length - cleaning.fixedIds.length : 0;
  const baseName = fileName.replace(/\.(csv|xlsx)$/i, "");

  return (
    <main className="flex flex-1 flex-col">
      <DatasetHeader
        dataset={dataset}
        saved={!!analysisId && !saveFailed}
        tab={tab}
        onTab={setTab}
        issuesLeft={issuesLeft}
        canDownload={cleaningStatus !== "scanning"}
        onDownload={() => downloadCsv(`${baseName}-cleaned.csv`, cleaned.headers, cleaned.rows)}
      />

      <div className="flex flex-1 flex-col bg-purple-light/30 px-4 py-8 sm:px-6">
        <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col">
          {saveFailed && (
            <p role="status" className="mb-6 rounded-xl bg-orange-light px-4 py-3 text-sm text-navy">
              Heads up: we couldn&rsquo;t save this one to your history, but you can
              still explore it and ask questions.
            </p>
          )}

          {/* Kept on the page (just hidden) on other tabs, so a question that's still
              being answered isn't lost when switching tabs */}
          <div hidden={tab !== "ask"} role="tabpanel" aria-label="Ask" className="flex flex-1 flex-col">
            <AskQuestion dataset={cleaned} />
          </div>

          {tab === "data" && (
            <div role="tabpanel" aria-label="Data">
              <DataTab dataset={cleaned} />
            </div>
          )}

          {tab === "clean" && <CleaningPanel dataset={dataset} onShowIssue={showIssue} />}

          {tab === "clean" && (
            <>
              {/* Scroll box: scrolls down for many rows and sideways for many columns */}
              <div
                ref={tableBoxRef}
                className="mt-6 max-h-[70vh] overflow-auto rounded-lg border border-zinc-200"
              >
                <table className="min-w-full border-collapse text-sm">
                  {/* sticky keeps the headers visible while scrolling down */}
                  <thead className="sticky top-0 bg-zinc-100">
                    <tr>
                      <th className="border-b border-zinc-200 px-3 py-2 text-right font-medium text-zinc-500">
                        #
                      </th>
                      {headers.map((header, i) => (
                        <th
                          key={i}
                          className="whitespace-nowrap border-b border-zinc-200 px-3 py-2 text-left font-semibold"
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
                              ? "even:bg-zinc-50"
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
                  className="rounded-full border border-zinc-300 px-5 py-2 text-sm font-medium hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Previous
                </button>
                <span className="text-sm text-zinc-600">
                  Page {page} of {totalPages}
                </span>
                <button
                  onClick={() => goToPage(page + 1)}
                  disabled={page === totalPages}
                  className="rounded-full border border-zinc-300 px-5 py-2 text-sm font-medium hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            </>
          )}
        </div>
      </div>

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

// The analysis title: the saved (or AI) title for saved analyses, else the file name.
// Updates when the AI title arrives a few seconds after uploading, or after a rename.
function useAnalysisTitle(analysisId: string | null, fileName: string) {
  const [title, setTitle] = useState<string | null>(null);

  useEffect(() => {
    if (!analysisId) return;
    let ignore = false;
    const load = () =>
      getAnalysisTitle(analysisId)
        .then((t) => !ignore && setTitle(t))
        .catch((err) => console.error("Couldn't load the analysis title:", err));
    void load();
    window.addEventListener(HISTORY_CHANGED, load);
    return () => {
      ignore = true;
      window.removeEventListener(HISTORY_CHANGED, load);
    };
  }, [analysisId]);

  return (analysisId && title) || fileName;
}

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: "ask", label: "Ask", icon: <MessageCircle aria-hidden="true" className="size-4" /> },
  { id: "data", label: "Data", icon: <Sheet aria-hidden="true" className="size-4" /> },
  { id: "clean", label: "Clean", icon: <Sparkles aria-hidden="true" className="size-4" /> },
];

// White band at the top: back link, title, tags, Download CSV, and the three tabs
function DatasetHeader({
  dataset,
  saved,
  tab,
  onTab,
  issuesLeft,
  canDownload,
  onDownload,
}: {
  dataset: Dataset;
  saved: boolean;
  tab: Tab;
  onTab: (tab: Tab) => void;
  issuesLeft: number;
  canDownload: boolean;
  onDownload: () => void;
}) {
  const { analysisId } = useDataset();
  const { email } = useUserEmail();
  const title = useAnalysisTitle(analysisId, dataset.fileName);
  const tagClass = "rounded-full bg-purple-light/60 px-2.5 py-1 text-xs font-semibold text-grey";

  return (
    <div className="border-b border-purple-light bg-white px-4 pt-6 text-navy sm:px-6">
      <div className="mx-auto max-w-6xl">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            {email ? (
              <Link
                href="/analyses"
                className="flex w-fit items-center gap-1 text-sm font-semibold text-purple hover:underline"
              >
                <ArrowLeft aria-hidden="true" className="size-4" /> My analyses
              </Link>
            ) : (
              // Guests have no saved analyses; a plain link opens the upload page fresh
              <a
                href="/upload"
                className="flex w-fit items-center gap-1 text-sm font-semibold text-purple hover:underline"
              >
                <ArrowLeft aria-hidden="true" className="size-4" /> Upload another file
              </a>
            )}
            <h1 className="mt-2 break-words font-display text-2xl font-extrabold tracking-tight sm:text-4xl">
              {title}
            </h1>
            <div className="mt-3 flex flex-wrap gap-2">
              <span className={`${tagClass} max-w-full truncate`} title={dataset.fileName}>
                {dataset.fileName}
              </span>
              <span className={tagClass}>
                {dataset.rows.length.toLocaleString()} rows × {dataset.headers.length.toLocaleString()}{" "}
                {dataset.headers.length === 1 ? "column" : "columns"}
              </span>
              {saved && (
                <span className="flex items-center gap-1 rounded-full bg-purple-light px-2.5 py-1 text-xs font-semibold text-purple">
                  <Check aria-hidden="true" className="size-3.5" strokeWidth={3} /> Saved
                </span>
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={onDownload}
            disabled={!canDownload}
            title={canDownload ? "Download the data with your fixes applied" : "Wait for the data check to finish"}
            className="flex shrink-0 items-center gap-2 rounded-full border-2 border-navy px-5 py-2.5 text-sm font-bold hover:bg-purple-light/60 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Download aria-hidden="true" className="size-4" /> Download CSV
          </button>
        </div>

        {/* Scrolls sideways on narrow phones instead of squashing */}
        <div role="tablist" aria-label="Analysis sections" className="-mx-4 mt-6 flex gap-3 overflow-x-auto px-4 pb-5 sm:mx-0 sm:px-0">
          {TABS.map((t) => {
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => onTab(t.id)}
                className={`flex shrink-0 items-center gap-2 rounded-full px-5 py-2.5 text-sm font-bold transition-all ${
                  active
                    ? "bg-purple text-white shadow-[0_4px_0_var(--color-purple-dark)]"
                    : "border-2 border-purple-light bg-white text-navy hover:bg-purple-light/60"
                }`}
              >
                {t.icon}
                {t.label}
                {t.id === "clean" && issuesLeft > 0 && (
                  <span
                    aria-label={`${issuesLeft} issues left`}
                    className="flex min-w-5 items-center justify-center rounded-full bg-pink px-1.5 py-0.5 text-xs leading-none text-white"
                  >
                    {issuesLeft.toLocaleString()}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
