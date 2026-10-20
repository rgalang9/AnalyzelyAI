import type { TableInfo } from "@/lib/learn/sql/runner";

// Side panel listing the lesson's tables and their columns, like a SQL tool's explorer
export default function SchemaPanel({
  tables,
  onViewData,
}: {
  tables: TableInfo[];
  onViewData: (table: string) => void;
}) {
  return (
    <div className="p-3 text-sm">
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">Tables</h3>
      {tables.map((table) => (
        <details key={table.name} open>
          <summary className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 font-medium hover:bg-zinc-100 dark:hover:bg-zinc-900">
            ▦ {table.name}
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault(); // don't fold the column list
                onViewData(table.name);
              }}
              className="ml-auto rounded-md border border-zinc-300 px-2 py-0.5 text-xs font-medium hover:bg-background dark:border-zinc-700"
            >
              View data
            </button>
          </summary>
          <ul className="mb-2 ml-4 border-l border-zinc-200 pl-3 dark:border-zinc-800">
            {table.columns.map((col) => (
              <li key={col.name} className="flex justify-between gap-2 py-0.5 font-mono text-xs">
                <span>{col.name}</span>
                <span className="text-zinc-400">{col.type.toLowerCase()}</span>
              </li>
            ))}
          </ul>
        </details>
      ))}
    </div>
  );
}
