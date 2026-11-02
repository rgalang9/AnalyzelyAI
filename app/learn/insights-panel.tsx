"use client";

import { useEffect, useRef } from "react";
import {
  AGGS,
  chartData,
  computePivot,
  distinctValues,
  fieldIndex,
  labelOf,
  type Agg,
  type ChartSettings,
  type ChartType,
  type DataTable,
  type InsightsState,
  type PivotSettings,
} from "@/lib/learn/excel/insights";

// The Insights panel beside the grid: a simple pivot table and a chart of the data block the
// learner picked. It never changes the sheet. The sums live in lib/learn/excel/insights.ts.

export type InsightsTab = "pivot" | "chart";

const AGG_LABELS: Record<Agg, string> = { sum: "Sum", count: "Count", average: "Average", max: "Max", min: "Min" };
const CHART_LABELS: Record<ChartType, string> = { column: "Column", bar: "Bar", line: "Line", pie: "Pie", scatter: "Scatter", combo: "Combo" };
const COLOURS = ["#6d28d9", "#0ea5e9", "#f59e0b", "#10b981", "#ef4444", "#64748b", "#ec4899", "#84cc16"];

export default function InsightsPanel({
  tab,
  state,
  table,
  onTab,
  onChange,
  onUseSelection,
  onClose,
}: {
  tab: InsightsTab;
  state: InsightsState;
  table: DataTable | null;
  onTab: (tab: InsightsTab) => void;
  onChange: (state: InsightsState) => void;
  onUseSelection: () => void; // read the data block around the selected cell
  onClose: () => void;
}) {
  return (
    <aside aria-label="Insights" className="flex h-full w-80 shrink-0 flex-col border-l border-zinc-200 bg-white text-sm">
      <div className="flex items-center justify-between border-b border-zinc-200 px-3 py-2">
        <div role="tablist" className="flex gap-1">
          {(["pivot", "chart"] as const).map((t) => (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={tab === t}
              onClick={() => onTab(t)}
              className={`rounded-full px-3 py-1 text-xs font-medium ${tab === t ? "bg-purple text-white" : "text-zinc-600 hover:bg-zinc-100"}`}
            >
              {t === "pivot" ? "Pivot table" : "Chart"}
            </button>
          ))}
        </div>
        <button type="button" onClick={onClose} aria-label="Close the panel" className="rounded px-2 text-lg leading-none text-zinc-500 hover:bg-zinc-100">
          ×
        </button>
      </div>

      <div className="border-b border-zinc-200 px-3 py-2 text-xs text-zinc-600">
        {state.source ? (
          <>
            Data: <span className="font-mono">{state.source.sheet}!{state.source.range}</span>
          </>
        ) : (
          "No data yet: click a cell in your data first."
        )}
        <button type="button" onClick={onUseSelection} className="ml-2 font-medium text-purple hover:underline">
          Use selected cells
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
        {!table || table.fields.length === 0 ? (
          <p className="text-zinc-500">Click any cell inside your data (with a header row), then press Use selected cells.</p>
        ) : tab === "pivot" ? (
          <PivotTab table={table} settings={state.pivot} onChange={(pivot) => onChange({ ...state, pivot })} />
        ) : (
          <ChartTab table={table} settings={state.chart} onChange={(chart) => onChange({ ...state, chart })} />
        )}
      </div>
    </aside>
  );
}

// ---------- Small form parts ----------

function Pick<T extends string>({
  label,
  value,
  options,
  onChange,
  none,
}: {
  label: string;
  value: T | null;
  options: { value: T; label: string }[];
  onChange: (value: T | null) => void;
  none?: string; // the "nothing picked" choice, if allowed
}) {
  return (
    <label className="mb-2 flex items-center justify-between gap-2">
      <span className="text-zinc-700">{label}</span>
      <select
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value === "" ? null : (e.target.value as T))}
        className="w-40 rounded-md border border-zinc-300 bg-white px-2 py-1"
      >
        {(none !== undefined || value === null) && <option value="">{none ?? "Choose…"}</option>}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

const fieldOptions = (table: DataTable) => table.fields.map((f) => ({ value: f.name, label: f.name }));
const aggOptions = AGGS.map((a) => ({ value: a, label: AGG_LABELS[a] }));

// A table field name as the table spells it (task settings may differ in capitals)
const spelled = (table: DataTable, name: string | null) => (name === null ? null : (table.fields[fieldIndex(table, name)]?.name ?? name));

function fmt(n: number | null, percent: boolean) {
  if (n === null) return "";
  return percent ? `${(n * 100).toFixed(1)}%` : n.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

// ---------- Pivot ----------

function PivotTab({ table, settings, onChange }: { table: DataTable; settings: PivotSettings; onChange: (s: PivotSettings) => void }) {
  const set = (part: Partial<PivotSettings>) => onChange({ ...settings, ...part });
  const fieldOf = (name: string | null) => table.fields[fieldIndex(table, name)];
  const hasDate = [settings.rows, settings.columns].some((n) => fieldOf(n)?.kind === "date");
  const valueField = fieldOf(settings.values);
  const sliced = Object.keys(settings.slicers);
  const result = computePivot(table, settings);
  const pct = settings.percentOfTotal;

  return (
    <div>
      <Pick label="Rows" value={spelled(table, settings.rows)} options={fieldOptions(table)} onChange={(rows) => set({ rows })} />
      <Pick label="Columns" none="(none)" value={spelled(table, settings.columns)} options={fieldOptions(table)} onChange={(columns) => set({ columns })} />
      <Pick label="Values" value={spelled(table, settings.values)} options={fieldOptions(table)} onChange={(values) => set({ values })} />
      <Pick label="Summarize by" value={settings.agg} options={aggOptions} onChange={(agg) => set({ agg: agg ?? "sum" })} />
      {valueField && valueField.kind !== "number" && settings.agg !== "count" && (
        <p className="mb-2 text-xs text-amber-700">
          {valueField.name} isn&apos;t a number field, so {AGG_LABELS[settings.agg]} has nothing to add up. Try Count.
        </p>
      )}

      <label className="mb-1 flex items-center gap-2">
        <input type="checkbox" checked={settings.percentOfTotal} onChange={(e) => set({ percentOfTotal: e.target.checked })} />
        Show as % of total
      </label>
      <label className={`mb-3 flex items-center gap-2 ${hasDate ? "" : "text-zinc-400"}`}>
        <input type="checkbox" disabled={!hasDate} checked={settings.groupByMonth} onChange={(e) => set({ groupByMonth: e.target.checked })} />
        Group dates by month
      </label>

      <div className="mb-3">
        <Pick
          label="Slicers"
          value={null}
          none="Add a slicer…"
          options={table.fields.filter((f) => !sliced.some((s) => s.toLowerCase() === f.name.toLowerCase())).map((f) => ({ value: f.name, label: f.name }))}
          onChange={(name) => name && set({ slicers: { ...settings.slicers, [name]: distinctValues(table, name) } })}
        />
        {sliced.map((name) => {
          const ticked = new Set(settings.slicers[name].map((v) => v.toLowerCase()));
          const values = distinctValues(table, name);
          return (
            <fieldset key={name} className="mb-2 rounded-lg border border-zinc-200 px-2 py-1.5">
              <legend className="flex w-full items-center justify-between px-1 text-xs font-semibold">
                {spelled(table, name)}
                <button
                  type="button"
                  className="ml-2 font-normal text-zinc-500 hover:underline"
                  onClick={() => {
                    const rest = { ...settings.slicers };
                    delete rest[name];
                    set({ slicers: rest });
                  }}
                >
                  Remove
                </button>
              </legend>
              <div className="flex flex-wrap gap-x-3">
                {values.map((v) => (
                  <label key={v} className="flex items-center gap-1 text-xs">
                    <input
                      type="checkbox"
                      checked={ticked.has(v.toLowerCase())}
                      onChange={(e) => {
                        const next = values.filter((x) => (x === v ? e.target.checked : ticked.has(x.toLowerCase())));
                        set({ slicers: { ...settings.slicers, [name]: next } });
                      }}
                    />
                    {v}
                  </label>
                ))}
              </div>
            </fieldset>
          );
        })}
      </div>

      {!result.rowField ? (
        <p className="text-zinc-500">Pick a field for Rows to see the pivot table.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="border-b border-zinc-300 bg-zinc-50">
                <th className="px-2 py-1 text-left">{result.rowField.name}</th>
                {result.colKeys.map((c) => (
                  <th key={c} className="px-2 py-1 text-right">
                    {labelOf(c, result.colField ?? undefined)}
                  </th>
                ))}
                <th className="px-2 py-1 text-right">{result.colField ? "Grand Total" : `${AGG_LABELS[settings.agg]} of ${valueField?.name ?? "rows"}`}</th>
              </tr>
            </thead>
            <tbody>
              {result.rowKeys.map((r) => (
                <tr key={r} className="border-b border-zinc-100">
                  <td className="px-2 py-1">{labelOf(r, result.rowField!)}</td>
                  {result.colKeys.map((c) => (
                    <td key={c} className="px-2 py-1 text-right tabular-nums">
                      {fmt(result.cell(r, c), pct)}
                    </td>
                  ))}
                  <td className="px-2 py-1 text-right font-medium tabular-nums">{fmt(result.cell(r, null), pct)}</td>
                </tr>
              ))}
              <tr className="border-t-2 border-zinc-300 font-semibold">
                <td className="px-2 py-1">Grand Total</td>
                {result.colKeys.map((c) => (
                  <td key={c} className="px-2 py-1 text-right tabular-nums">
                    {fmt(result.colTotal(c), pct)}
                  </td>
                ))}
                <td className="px-2 py-1 text-right tabular-nums">{fmt(result.grand, pct)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ---------- Chart ----------

function ChartTab({ table, settings, onChange }: { table: DataTable; settings: ChartSettings; onChange: (s: ChartSettings) => void }) {
  const set = (part: Partial<ChartSettings>) => onChange({ ...settings, ...part });
  const canvas = useRef<HTMLCanvasElement>(null);
  const data = chartData(table, settings);
  const yName = spelled(table, settings.y);
  const lineName = spelled(table, settings.line);
  // Redraw only when what's drawn changes
  const drawn = JSON.stringify([settings, data]);

  useEffect(() => {
    if (!canvas.current || !data) return;
    let chart: { destroy: () => void } | null = null;
    let cancelled = false;
    (async () => {
      const { Chart, registerables } = await import("chart.js");
      Chart.register(...registerables);
      if (cancelled || !canvas.current) return;
      const label = (name: string | null) => (settings.agg === "count" ? `Count of ${name ?? "rows"}` : `${AGG_LABELS[settings.agg]} of ${name ?? ""}`);
      const title = settings.title ? { display: true, text: settings.title } : { display: false };
      if (data.kind === "points") {
        chart = new Chart(canvas.current, {
          type: "scatter",
          data: { datasets: [{ label: `${yName ?? ""} vs ${spelled(table, settings.x) ?? ""}`, data: data.points, backgroundColor: COLOURS[0] }] },
          options: { animation: false, plugins: { title } },
        });
        return;
      }
      if (settings.type === "pie") {
        chart = new Chart(canvas.current, {
          type: "pie",
          data: { labels: data.labels, datasets: [{ label: label(yName), data: data.y, backgroundColor: data.labels.map((_, i) => COLOURS[i % COLOURS.length]) }] },
          options: { animation: false, plugins: { title } },
        });
        return;
      }
      const type = settings.type === "line" ? "line" : "bar";
      const datasets = [
        { type, label: label(yName), data: data.y, backgroundColor: COLOURS[0], borderColor: COLOURS[0] },
        ...(settings.type === "combo" && data.line
          ? [{ type: "line" as const, label: label(lineName), data: data.line, backgroundColor: COLOURS[2], borderColor: COLOURS[2], yAxisID: "y2" }]
          : []),
      ];
      chart = new Chart(canvas.current, {
        type,
        data: { labels: data.labels, datasets: datasets as never },
        options: {
          animation: false,
          indexAxis: settings.type === "bar" ? "y" : "x",
          plugins: { title },
          scales: settings.type === "combo" && data.line ? { y2: { position: "right", grid: { drawOnChartArea: false } } } : {},
        },
      });
    })();
    return () => {
      cancelled = true;
      chart?.destroy();
    };
    // `drawn` covers settings and data
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drawn]);

  const combo = settings.type === "combo";
  return (
    <div>
      <Pick
        label="Chart type"
        value={settings.type}
        options={(Object.keys(CHART_LABELS) as ChartType[]).map((t) => ({ value: t, label: CHART_LABELS[t] }))}
        onChange={(type) => set({ type: type ?? "column" })}
      />
      <Pick label={settings.type === "pie" ? "Slices" : "X field"} value={spelled(table, settings.x)} options={fieldOptions(table)} onChange={(x) => set({ x })} />
      <Pick label={combo ? "Bar field" : settings.type === "pie" ? "Values" : "Y field"} value={yName} options={fieldOptions(table)} onChange={(y) => set({ y })} />
      {combo && <Pick label="Line field" value={lineName} options={fieldOptions(table)} onChange={(line) => set({ line })} />}
      {settings.type !== "scatter" && <Pick label="Summarize by" value={settings.agg} options={aggOptions} onChange={(agg) => set({ agg: agg ?? "sum" })} />}
      <label className="mb-3 flex items-center justify-between gap-2">
        <span className="text-zinc-700">Title</span>
        <input
          type="text"
          value={settings.title}
          onChange={(e) => set({ title: e.target.value })}
          placeholder="Chart title"
          className="w-40 rounded-md border border-zinc-300 px-2 py-1"
        />
      </label>
      {data ? (
        <div className="relative h-64">
          <canvas ref={canvas} aria-label={settings.title || "Chart"} role="img" />
        </div>
      ) : (
        <p className="text-zinc-500">Pick an X field and a Y field to draw the chart.</p>
      )}
    </div>
  );
}
