"use client"; // charts are drawn in the browser

import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from "recharts";
import { formatNumber, type ChartData } from "@/lib/dataset-stats";

// Shared look: muted axes and grid so the data stands out
const AXIS_TICK = { fill: "#71717a", fontSize: 12 };
const GRID_COLOR = "#71717a33";
const TOOLTIP_STYLE = {
  background: "var(--background)",
  border: "1px solid #71717a55",
  borderRadius: 8,
  color: "var(--foreground)",
  fontSize: 13,
};

const shorten = (text: string | number, max = 18) => {
  const s = String(text);
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
};
const formatValue = (value: unknown) =>
  typeof value === "number" ? formatNumber(value) : String(value);

export default function AnalysisChart({ chart }: { chart: ChartData }) {
  const { type, points, xLabel, yLabel } = chart;

  return (
    <figure className="rounded-2xl border border-zinc-200 p-4 dark:border-zinc-800">
      <figcaption className="mb-3">
        <p className="font-semibold">{chart.title}</p>
        <p className="text-xs text-zinc-500">
          {type === "scatter" ? `${yLabel} vs. ${xLabel}` : `${yLabel} by ${xLabel}`}
          {chart.note && ` · ${chart.note}`}
        </p>
      </figcaption>

      {/* currentColor = the chart color, so it switches with light/dark mode */}
      <div style={{ color: "var(--series-1)" }}>
        {type === "bar" && (
          // Horizontal bars keep long category names readable
          <ResponsiveContainer width="100%" height={Math.max(200, points.length * 30 + 40)}>
            <BarChart data={points} layout="vertical" margin={{ left: 8, right: 16 }}>
              <CartesianGrid horizontal={false} stroke={GRID_COLOR} />
              <XAxis type="number" tick={AXIS_TICK} tickFormatter={formatValue} stroke={GRID_COLOR} />
              <YAxis
                type="category"
                dataKey="x"
                width={130}
                tick={AXIS_TICK}
                tickFormatter={(v) => shorten(v)}
                stroke={GRID_COLOR}
                interval={0}
              />
              <Tooltip
                cursor={{ fill: "#71717a1a" }}
                contentStyle={TOOLTIP_STYLE}
                formatter={(value) => [formatValue(value), yLabel]}
              />
              <Bar dataKey="y" fill="currentColor" radius={[0, 4, 4, 0]} maxBarSize={20} />
            </BarChart>
          </ResponsiveContainer>
        )}

        {type === "line" && (
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={points} margin={{ left: 8, right: 16 }}>
              <CartesianGrid vertical={false} stroke={GRID_COLOR} />
              <XAxis dataKey="x" tick={AXIS_TICK} tickFormatter={(v) => shorten(v, 12)} stroke={GRID_COLOR} minTickGap={24} />
              <YAxis tick={AXIS_TICK} tickFormatter={formatValue} stroke={GRID_COLOR} width={70} />
              <Tooltip
                contentStyle={TOOLTIP_STYLE}
                formatter={(value) => [formatValue(value), yLabel]}
              />
              <Line
                dataKey="y"
                stroke="currentColor"
                strokeWidth={2}
                dot={points.length <= 40 ? { r: 4, fill: "currentColor" } : false}
                activeDot={{ r: 5 }}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        )}

        {type === "scatter" && (
          <ResponsiveContainer width="100%" height={320}>
            <ScatterChart margin={{ left: 8, right: 16, bottom: 8 }}>
              <CartesianGrid stroke={GRID_COLOR} />
              <XAxis type="number" dataKey="x" name={xLabel} tick={AXIS_TICK} tickFormatter={formatValue} stroke={GRID_COLOR} />
              <YAxis type="number" dataKey="y" name={yLabel} tick={AXIS_TICK} tickFormatter={formatValue} stroke={GRID_COLOR} width={70} />
              <ZAxis range={[50, 50]} />
              <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(value) => formatValue(value)} />
              <Scatter data={points} fill="currentColor" fillOpacity={0.7} />
            </ScatterChart>
          </ResponsiveContainer>
        )}
      </div>
    </figure>
  );
}
