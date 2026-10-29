import type { SqlValue } from "sql.js";
import type { QueryResult } from "@/lib/learn/sql/runner";

function show(value: SqlValue, nullLabel: string) {
  if (value === null) return <span className="italic text-zinc-400">{nullLabel}</span>;
  if (value instanceof Uint8Array) return <span className="italic text-zinc-400">(binary)</span>;
  return String(value);
}

// A query's result as a grid, like the results panel in SQL tools.
// Python tables pass pandas' row labels (`rowLabels`, which start at 0), "NaN" for empty cells,
// and how many rows the full table has when only the first ones are shown. A pandas Series
// already has its row labels as its first column, so it turns the row-number column off.
export type GridExtras = {
  rowLabels?: string[];
  rowHeader?: string;
  nullLabel?: string;
  totalRows?: number;
  showRowColumn?: boolean;
};

export default function ResultsGrid({
  result,
  rowLabels,
  rowHeader = "Row",
  nullLabel = "NULL",
  totalRows,
  showRowColumn = true,
}: { result: QueryResult } & GridExtras) {
  if (result.columns.length === 0) {
    return <p className="p-4 text-sm text-zinc-500">Done. This query didn&rsquo;t return a table.</p>;
  }

  return (
    <div className="flex h-full flex-col">
      <div className="min-h-0 flex-1 overflow-auto">
        <table className="min-w-full border-collapse font-mono text-xs">
          <thead className="sticky top-0 bg-zinc-100">
            <tr>
              {showRowColumn && (
                <th className="w-px border-b border-r border-zinc-200 px-2 py-1.5 text-right font-medium text-zinc-400">
                  {rowHeader}
                </th>
              )}
              {result.columns.map((col, i) => (
                <th
                  key={i}
                  className="whitespace-nowrap border-b border-r border-zinc-200 px-3 py-1.5 text-left font-semibold"
                >
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {result.rows.map((row, r) => (
              <tr key={r} className="even:bg-zinc-50">
                {showRowColumn && (
                  <td className="w-px border-r border-zinc-200 px-2 py-1 text-right text-zinc-400">
                    {rowLabels ? rowLabels[r] : r + 1}
                  </td>
                )}
                {row.map((value, c) => (
                  <td key={c} className="whitespace-nowrap border-r border-zinc-200 px-3 py-1">
                    {show(value, nullLabel)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {result.rows.length === 0 && <p className="p-4 text-sm text-zinc-500">No rows matched.</p>}
      </div>
      <p className="border-t border-zinc-200 px-3 py-1 text-xs text-zinc-500">
        {totalRows !== undefined && totalRows > result.rows.length
          ? `Showing the first ${result.rows.length.toLocaleString()} of ${totalRows.toLocaleString()} rows`
          : `${result.rows.length} row${result.rows.length === 1 ? "" : "s"}`}
      </p>
    </div>
  );
}
