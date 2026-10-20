import type { SqlValue } from "sql.js";
import type { QueryResult } from "@/lib/learn/sql/runner";

function show(value: SqlValue) {
  if (value === null) return <span className="italic text-zinc-400">NULL</span>;
  if (value instanceof Uint8Array) return <span className="italic text-zinc-400">(binary)</span>;
  return String(value);
}

// A query's result as a grid, like the results panel in SQL tools
export default function ResultsGrid({ result }: { result: QueryResult }) {
  if (result.columns.length === 0) {
    return <p className="p-4 text-sm text-zinc-500">Done. This query didn&rsquo;t return a table.</p>;
  }

  return (
    <div className="flex h-full flex-col">
      <div className="min-h-0 flex-1 overflow-auto">
        <table className="min-w-full border-collapse font-mono text-xs">
          <thead className="sticky top-0 bg-zinc-100 dark:bg-zinc-900">
            <tr>
              <th className="w-px border-b border-r border-zinc-200 px-2 py-1.5 text-right font-medium text-zinc-400 dark:border-zinc-800">
                Row
              </th>
              {result.columns.map((col, i) => (
                <th
                  key={i}
                  className="whitespace-nowrap border-b border-r border-zinc-200 px-3 py-1.5 text-left font-semibold dark:border-zinc-800"
                >
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {result.rows.map((row, r) => (
              <tr key={r} className="even:bg-zinc-50 dark:even:bg-zinc-900/40">
                <td className="w-px border-r border-zinc-200 px-2 py-1 text-right text-zinc-400 dark:border-zinc-800">
                  {r + 1}
                </td>
                {row.map((value, c) => (
                  <td key={c} className="whitespace-nowrap border-r border-zinc-200 px-3 py-1 dark:border-zinc-800">
                    {show(value)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {result.rows.length === 0 && <p className="p-4 text-sm text-zinc-500">No rows matched.</p>}
      </div>
      <p className="border-t border-zinc-200 px-3 py-1 text-xs text-zinc-500 dark:border-zinc-800">
        {result.rows.length} row{result.rows.length === 1 ? "" : "s"}
      </p>
    </div>
  );
}
