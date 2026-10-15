"use client"; // reads the dataset from shared browser memory and handles page clicks

import { useRef, useState } from "react";
import Link from "next/link";
import { useDataset } from "../dataset-context";
import AskQuestion from "./ask-question";

const ROWS_PER_PAGE = 250;

export default function DatasetPage() {
  const { dataset } = useDataset();
  const [page, setPage] = useState(1);
  const tableBoxRef = useRef<HTMLDivElement>(null);

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

  const { fileName, headers, rows } = dataset;
  const totalPages = Math.max(1, Math.ceil(rows.length / ROWS_PER_PAGE));
  const start = (page - 1) * ROWS_PER_PAGE;
  const pageRows = rows.slice(start, start + ROWS_PER_PAGE);

  function goToPage(newPage: number) {
    setPage(newPage);
    tableBoxRef.current?.scrollTo({ top: 0 }); // start the new page at the top
  }

  return (
    <main className="flex flex-1 flex-col px-6 py-10">
      <Link href="/upload" className="text-sm text-zinc-500 hover:text-foreground">
        ← Upload a different file
      </Link>

      <h1 className="mt-4 text-2xl font-bold tracking-tight">{fileName}</h1>
      <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
        {rows.length.toLocaleString()} rows · {headers.length} columns
      </p>

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
            {pageRows.map((row, rowIndex) => (
              <tr
                key={start + rowIndex}
                className="even:bg-zinc-50 dark:even:bg-zinc-900/40"
              >
                <td className="px-3 py-1.5 text-right text-zinc-400">
                  {start + rowIndex + 1}
                </td>
                {row.map((cell, i) => (
                  <td
                    key={i}
                    title={cell}
                    className="max-w-xs truncate whitespace-nowrap px-3 py-1.5"
                  >
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
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

      <AskQuestion dataset={dataset} />
    </main>
  );
}
