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
import { downloadBlob } from "@/lib/download";

// Shared look: brand grey axes and a light purple grid so the data stands out.
// Plain color codes (not CSS variables) so a saved PNG of the chart keeps them.
const AXIS_TICK = { fill: "#4a3f6b", fontSize: 12 };
const GRID_COLOR = "#ede5ff";
const TOOLTIP_STYLE = {
  background: "#ffffff",
  border: "1px solid #ede5ff",
  borderRadius: 8,
  color: "#24174f",
  fontSize: 13,
};

const shorten = (text: string | number, max = 18) => {
  const s = String(text);
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
};
const formatValue = (value: unknown) =>
  typeof value === "number" ? formatNumber(value) : String(value);

// The chart inside `figure` as a PNG picture (white background, title on top)
export async function saveChartPng(figure: HTMLElement, title: string, fileName: string) {
  const svg = figure.querySelector("svg.recharts-surface");
  if (!(svg instanceof SVGSVGElement)) throw new Error("No chart found");
  const { width, height } = svg.getBoundingClientRect();

  // Copy the chart with its color filled in, since "currentColor" means nothing outside the page
  const copy = svg.cloneNode(true) as SVGSVGElement;
  copy.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  copy.setAttribute("width", String(width));
  copy.setAttribute("height", String(height));
  copy.style.color = getComputedStyle(svg).color;
  copy.style.fontFamily = "Arial, sans-serif";
  const svgUrl = URL.createObjectURL(
    new Blob([new XMLSerializer().serializeToString(copy)], { type: "image/svg+xml" })
  );

  try {
    const image = new Image();
    image.src = svgUrl;
    await image.decode();

    const scale = 2; // sharper picture
    const pad = 24;
    const titleSpace = 40;
    const canvas = document.createElement("canvas");
    canvas.width = (width + pad * 2) * scale;
    canvas.height = (height + pad * 2 + titleSpace) * scale;
    const ctx = canvas.getContext("2d")!;
    ctx.scale(scale, scale);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width + pad * 2, height + pad * 2 + titleSpace);
    ctx.fillStyle = "#24174f";
    ctx.font = "bold 18px Arial, sans-serif";
    ctx.fillText(title, pad, pad + 18, width);
    ctx.drawImage(image, pad, pad + titleSpace, width, height);

    const png = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
    if (!png) throw new Error("Couldn't make the picture");
    downloadBlob(fileName, png);
  } finally {
    URL.revokeObjectURL(svgUrl);
  }
}

// `ref` lets the answer card find this chart for "Save chart"
export default function AnalysisChart({
  chart,
  ref,
}: {
  chart: ChartData;
  ref?: React.Ref<HTMLElement>;
}) {
  const { type, points, xLabel, yLabel } = chart;

  return (
    <figure ref={ref} className="rounded-2xl border border-purple-light bg-white p-4 sm:p-5">
      <figcaption className="mb-3">
        <p className="font-display font-extrabold text-navy">{chart.title}</p>
        <p className="text-xs text-grey">
          {type === "scatter" ? `${yLabel} vs. ${xLabel}` : `${yLabel} by ${xLabel}`}
          {chart.note && ` · ${chart.note}`}
        </p>
      </figcaption>

      {/* currentColor = the chart color (--series-1 in globals.css) */}
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
                cursor={{ fill: "#ede5ff80" }}
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
