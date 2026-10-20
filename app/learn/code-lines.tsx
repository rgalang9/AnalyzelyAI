"use client";

import { useState } from "react";
import type { CodeLine } from "@/lib/learn/lesson-types";

// Words that get the keyword color when showing example code
const KEYWORDS = new Set(
  (
    "select from where and or not distinct as order by group having limit offset join inner left right " +
    "full outer on in like between is null case when then else end with insert into values update set " +
    "delete asc desc union all exists create table"
  ).split(" ")
);
const FUNCTIONS = new Set("count sum avg min max round upper lower length substr coalesce".split(" "));

// Colors one line of SQL for display (the editor has its own, fuller colorer)
export function SqlLine({ code }: { code: string }) {
  const parts = code.match(/'(?:[^']|'')*'?|--.*$|\b\d+(?:\.\d+)?\b|\b\w+\b|\s+|./g) ?? [];
  return (
    <>
      {parts.map((part, i) => {
        const word = part.toLowerCase();
        const color = part.startsWith("'")
          ? "var(--sql-string)"
          : part.startsWith("--")
            ? "var(--sql-comment)"
            : /^\d/.test(part)
              ? "var(--sql-number)"
              : KEYWORDS.has(word)
                ? "var(--sql-keyword)"
                : FUNCTIONS.has(word)
                  ? "var(--sql-function)"
                  : undefined;
        return (
          <span key={i} style={color ? { color } : undefined} className={KEYWORDS.has(word) ? "font-semibold" : ""}>
            {part}
          </span>
        );
      })}
    </>
  );
}

// Example code where hovering (or tapping) a line shows what that line does.
// select-none: learners type the code themselves rather than copying it.
export default function CodeLines({ lines }: { lines: CodeLine[] }) {
  const [active, setActive] = useState<number | null>(null);

  return (
    <div className="overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-800">
      <pre className="select-none bg-zinc-50 py-2 font-mono text-sm leading-7 dark:bg-zinc-900">
        {lines.map((l, i) => (
          <div
            key={i}
            tabIndex={0}
            onMouseEnter={() => setActive(i)}
            onFocus={() => setActive(i)}
            onClick={() => setActive(i)}
            className={`flex cursor-help px-3 outline-none ${active === i ? "bg-blue-100 dark:bg-blue-950/60" : ""}`}
          >
            <span className="mr-4 w-4 shrink-0 text-right text-zinc-400">{i + 1}</span>
            <code className="whitespace-pre-wrap">
              <SqlLine code={l.line} />
            </code>
          </div>
        ))}
      </pre>
      <p
        aria-live="polite"
        className="min-h-12 border-t border-zinc-200 px-4 py-3 text-sm dark:border-zinc-800"
      >
        {active === null ? (
          <span className="text-zinc-500">Hover over a line to see what it does.</span>
        ) : (
          <>
            <span className="font-medium">Line {active + 1}: </span>
            {lines[active].explain}
          </>
        )}
      </p>
    </div>
  );
}
