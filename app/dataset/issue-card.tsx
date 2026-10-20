"use client";

import { ISSUE_LABELS, type Issue } from "@/lib/cleaning";

// One problem: what's wrong, what we suggest, and a Fix / Undo button.
// Used in the hover tooltip on red/green cells and in the issue list.
export function IssueCard({
  issue,
  original,
  fixed,
  canFix,
  onToggle,
  children,
}: {
  issue: Issue;
  original: string; // the cell's original value ("" for whole-row issues)
  fixed: boolean;
  canFix: boolean; // false while the AI is still double-checking
  onToggle: () => void;
  children?: React.ReactNode; // extra buttons
}) {
  const adviceLabel = !issue.fix
    ? "Note: "
    : issue.certainty === "suggestion"
      ? "Suggestion (not certain): "
      : "Suggested fix: ";

  return (
    <div className="flex flex-col gap-1.5 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium dark:bg-zinc-800">
          {ISSUE_LABELS[issue.kind]}
        </span>
        {fixed && (
          <span className="text-xs font-medium text-green-700 dark:text-green-400">Fixed ✓</span>
        )}
      </div>

      <p className={fixed ? "text-zinc-500" : ""}>{issue.problem}</p>

      {fixed ? (
        <p>
          {issue.fix?.type === "remove_row" ? (
            "This row is left out of the cleaned data."
          ) : (
            <>
              Original value:{" "}
              <span className="font-medium">{original.trim() ? `"${original}"` : "(empty)"}</span>
            </>
          )}
        </p>
      ) : (
        <p className="text-zinc-600 dark:text-zinc-400">
          <span className="font-medium text-foreground">{adviceLabel}</span>
          {issue.advice}
        </p>
      )}

      <div className="mt-1 flex flex-wrap gap-2">
        {issue.fix && (
          <button
            type="button"
            onClick={onToggle}
            disabled={!canFix}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-opacity hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-40 ${
              fixed
                ? "border border-zinc-300 dark:border-zinc-700"
                : "bg-foreground text-background"
            }`}
          >
            {fixed ? "Undo" : "Fix"}
          </button>
        )}
        {children}
      </div>
    </div>
  );
}

// Floating box shown next to a highlighted cell. `fixed` positioning keeps it
// from being cut off by the table's scroll box.
export function IssueTooltip({
  anchor,
  onMouseEnter,
  onMouseLeave,
  children,
}: {
  anchor: DOMRect; // where the hovered cell is on screen
  onMouseEnter: () => void;
  onMouseLeave: () => void;
  children: React.ReactNode;
}) {
  const width = 320;
  const left = Math.max(8, Math.min(anchor.left, window.innerWidth - width - 8));
  const fitsBelow = anchor.bottom + 240 < window.innerHeight;
  const position = fitsBelow
    ? { top: anchor.bottom + 4, left }
    : { bottom: window.innerHeight - anchor.top + 4, left };

  return (
    <div
      role="tooltip"
      style={{ ...position, width }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      className="fixed z-50 max-w-[calc(100vw-1rem)] rounded-xl border border-zinc-200 bg-background p-3 shadow-lg dark:border-zinc-800"
    >
      {children}
    </div>
  );
}
