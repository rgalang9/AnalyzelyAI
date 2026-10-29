"use client";

import { useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Search } from "lucide-react";
import type { Dataset } from "@/lib/parse-dataset";
import { isCode, toNumber } from "@/lib/dataset-stats";
import { columnType, duplicateRows, isMissing, yearOf, type ColumnType } from "@/lib/data-checks";

const ROWS_PER_PAGE = 250;

// Spreadsheet-style column letters: A, B, … Z, AA, AB, …
function columnLetter(index: number): string {
  let letters = "";
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) {
    letters = String.fromCharCode(65 + ((n - 1) % 26)) + letters;
  }
  return letters;
}

const plural = (n: number, word: string) => `${n.toLocaleString()} ${word}${n === 1 ? "" : "s"}`;

const TYPE_TAGS: Record<ColumnType, { label: string; className: string }> = {
  date: { label: "Date", className: "bg-purple-light text-purple" },
  number: { label: "Number", className: "bg-orange-light text-orange-dark" },
  text: { label: "Text", className: "bg-pink-light text-pink" },
};

// Plain numbers get commas (2500 → 2,500). Anything else, like "$19.99" or a zip code
// like "02134", is shown as written.
function displayNumber(cell: string): string {
  const n = toNumber(cell);
  return n !== null && /^[-+]?[\d.]+$/.test(cell.trim()) && !isCode(cell)
    ? n.toLocaleString("en-US", { maximumFractionDigits: 10 })
    : cell;
}

// The Data tab: four summary cards and a searchable spreadsheet view of the data
export default function DataTab({ dataset }: { dataset: Dataset }) {
  const { headers, rows } = dataset;
  const types = useMemo(() => headers.map((_, col) => columnType(rows, col)), [headers, rows]);

  return (
    <div className="flex flex-col gap-6">
      <SummaryCards dataset={dataset} types={types} />
      <DataTable dataset={dataset} types={types} />
    </div>
  );
}

function SummaryCards({ dataset, types }: { dataset: Dataset; types: ColumnType[] }) {
  const { headers, rows } = dataset;

  const cards = useMemo(() => {
    // Rows: the year range of the first date column, if there is one
    const dateCol = types.indexOf("date");
    const years = dateCol === -1 ? [] : rows.map((r) => yearOf(r[dateCol])).filter((y) => y !== null);
    const rowDetail = years.length
      ? `${years.reduce((a, b) => Math.min(a, b))} – ${years.reduce((a, b) => Math.max(a, b))}`
      : "in this file";

    // Columns: how many of each kind
    const count = (t: ColumnType) => types.filter((x) => x === t).length;
    const columnDetail = [
      count("date") && plural(count("date"), "date"),
      count("number") && plural(count("number"), "number"),
      count("text") && `${count("text").toLocaleString()} text`,
    ]
      .filter(Boolean)
      .join(" · ");

    // Missing values: blanks and placeholders like "N/A"
    const missing: { row: number; col: number }[] = [];
    rows.forEach((row, r) => row.forEach((cell, c) => isMissing(cell) && missing.push({ row: r, col: c })));
    const missingCols = new Set(missing.map((m) => m.col));
    const missingDetail =
      missing.length === 0
        ? "none found"
        : missing.length === 1
          ? `${headers[missing[0].col]}, row ${missing[0].row + 1}`
          : missingCols.size === 1
            ? `all in ${headers[missing[0].col]}`
            : `across ${plural(missingCols.size, "column")}`;

    const duplicates = duplicateRows(rows).size;

    return [
      { label: "Rows", value: rows.length, detail: rowDetail },
      { label: "Columns", value: headers.length, detail: columnDetail || "none" },
      { label: "Missing values", value: missing.length, detail: missingDetail },
      {
        label: "Duplicates",
        value: duplicates,
        detail: duplicates === 0 ? "all rows unique" : "exact copies of earlier rows",
      },
    ];
  }, [headers, rows, types]);

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
      {cards.map((card) => (
        <div key={card.label} className="rounded-2xl border border-purple-light bg-white p-4 sm:p-5">
          <p className="text-sm font-semibold text-grey">{card.label}</p>
          <p className="mt-1 font-display text-2xl font-extrabold text-navy">
            {card.value.toLocaleString()}
          </p>
          <p className="mt-1 truncate text-xs text-grey" title={card.detail}>
            {card.detail}
          </p>
        </div>
      ))}
    </div>
  );
}

function DataTable({ dataset, types }: { dataset: Dataset; types: ColumnType[] }) {
  const { headers, rows } = dataset;
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const tableBoxRef = useRef<HTMLDivElement>(null);

  // Rows that contain the search text in any cell (keeping their original row numbers)
  const matches = useMemo(() => {
    const words = search.trim().toLowerCase();
    const all = rows.map((row, index) => ({ row, index }));
    return words ? all.filter(({ row }) => row.some((cell) => cell.toLowerCase().includes(words))) : all;
  }, [rows, search]);

  const totalPages = Math.max(1, Math.ceil(matches.length / ROWS_PER_PAGE));
  const currentPage = Math.min(page, totalPages);
  const start = (currentPage - 1) * ROWS_PER_PAGE;
  const pageRows = matches.slice(start, start + ROWS_PER_PAGE);

  function goToPage(newPage: number) {
    setPage(newPage);
    tableBoxRef.current?.scrollTo({ top: 0 }); // start the new page at the top
  }

  const pagerClass =
    "flex items-center gap-1 rounded-full border-2 border-purple-light bg-white px-4 py-2 text-sm font-bold text-navy hover:bg-purple-light/60 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-white";
  const cellBorder = "border-b border-r border-purple-light";

  return (
    <section className="rounded-2xl border border-purple-light bg-white p-4 sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <label className="relative w-full sm:max-w-sm">
          <span className="sr-only">Search this table</span>
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-grey/70"
          />
          <input
            type="search"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Search this table"
            className="w-full rounded-xl border-2 border-purple-light bg-white py-2.5 pl-10 pr-3 text-sm text-navy outline-none placeholder:text-grey/60 focus:border-purple"
          />
        </label>
        <p className="text-sm text-grey">
          {matches.length === 0 ? (
            "No matching rows"
          ) : (
            <>
              Showing rows{" "}
              <span className="font-bold text-navy">
                {(start + 1).toLocaleString()}–{(start + pageRows.length).toLocaleString()}
              </span>{" "}
              of <span className="font-bold text-navy">{matches.length.toLocaleString()}</span>
              {search.trim() && " matching"}
            </>
          )}
        </p>
      </div>

      {/* Scroll box: scrolls down for many rows and sideways for many columns */}
      <div
        ref={tableBoxRef}
        className="mt-4 max-h-[70vh] overflow-auto rounded-xl border-l border-t border-purple-light"
      >
        <table className="min-w-full border-separate border-spacing-0 text-sm text-navy">
          {/* sticky keeps the letters and headers visible while scrolling down */}
          <thead className="sticky top-0 z-10 bg-white">
            <tr className="bg-purple-light/40 text-xs text-grey">
              <th className={`${cellBorder} w-10 px-2 py-1 font-normal`} />
              {headers.map((_, i) => (
                <th key={i} className={`${cellBorder} px-3 py-1 text-center font-normal`}>
                  {columnLetter(i)}
                </th>
              ))}
            </tr>
            <tr className="bg-purple-light/20">
              <th className={cellBorder} />
              {headers.map((header, i) => (
                <th key={i} className={`${cellBorder} px-3 py-2 text-left align-top`}>
                  <span className="block max-w-xs truncate whitespace-nowrap font-bold" title={header}>
                    {header}
                  </span>
                  <span
                    className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[11px] font-bold ${TYPE_TAGS[types[i]].className}`}
                  >
                    {TYPE_TAGS[types[i]].label}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pageRows.map(({ row, index }) => (
              <tr key={index} className="hover:bg-purple-light/20">
                <td className={`${cellBorder} bg-purple-light/20 px-2 py-2 text-center text-xs text-grey`}>
                  {index + 1}
                </td>
                {row.map((cell, i) => {
                  const isNumber = types[i] === "number";
                  return (
                    <td
                      key={i}
                      title={cell}
                      className={`${cellBorder} max-w-xs truncate whitespace-nowrap px-3 py-2 ${
                        isNumber ? "text-right tabular-nums" : ""
                      }`}
                    >
                      {isNumber ? displayNumber(cell) : cell}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>

        {rows.length === 0 && (
          <p className="p-6 text-center text-grey">This file has headers but no data rows.</p>
        )}
      </div>

      {/* Pagination controls */}
      <div className="mt-5 flex items-center justify-center gap-4">
        <button
          type="button"
          onClick={() => goToPage(currentPage - 1)}
          disabled={currentPage === 1}
          className={pagerClass}
        >
          <ArrowLeft aria-hidden="true" className="size-4" /> Previous
        </button>
        <span className="text-sm font-bold text-navy">
          Page {currentPage.toLocaleString()} of {totalPages.toLocaleString()}
        </span>
        <button
          type="button"
          onClick={() => goToPage(currentPage + 1)}
          disabled={currentPage === totalPages}
          className={pagerClass}
        >
          Next <ArrowRight aria-hidden="true" className="size-4" />
        </button>
      </div>
    </section>
  );
}
