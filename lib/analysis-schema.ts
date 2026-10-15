import { z } from "zod";

// ---- What the AI sends back ----
// The AI only *describes* charts and stats; the app computes the real numbers
// from the full dataset, so every figure on screen comes from the actual data.

export const ChartSpecSchema = z.object({
  title: z.string(),
  type: z.enum(["bar", "line", "scatter"]),
  x_column: z.string(),
  // null means "count rows" instead of using a value column
  y_column: z.string().nullable(),
  // how to combine y values per x value; scatter charts use "none"
  aggregation: z.enum(["sum", "mean", "count", "none"]),
});

export const StatSpecSchema = z.object({
  label: z.string(),
  type: z.enum([
    "mean",
    "median",
    "sum",
    "min",
    "max",
    "count",
    "distinct_count",
    "growth_rate",
    "correlation",
  ]),
  column: z.string(),
  // correlation: the second column. growth_rate: the time/order column (or null).
  column2: z.string().nullable(),
});

export const AnalysisSchema = z.object({
  analysis: z.string(),
  charts: z.array(ChartSpecSchema),
  stats: z.array(StatSpecSchema),
});

export type ChartSpec = z.infer<typeof ChartSpecSchema>;
export type StatSpec = z.infer<typeof StatSpecSchema>;
export type Analysis = z.infer<typeof AnalysisSchema>;

// ---- What the browser sends to /api/ask ----

export const ColumnProfileSchema = z.object({
  name: z.string(),
  kind: z.enum(["numeric", "text", "empty"]),
  filled: z.number(),
  empty: z.number(),
  distinct: z.number(),
  min: z.number().nullable(),
  max: z.number().nullable(),
  mean: z.number().nullable(),
  sum: z.number().nullable(),
  topValues: z.array(z.object({ value: z.string(), count: z.number() })),
});

export type ColumnProfile = z.infer<typeof ColumnProfileSchema>;

export const AskRequestSchema = z.object({
  question: z.string().trim().min(1).max(1000),
  fileName: z.string().max(300),
  totalRows: z.number(),
  isSample: z.boolean(),
  headers: z.array(z.string()).max(500),
  profile: z.array(ColumnProfileSchema).max(500),
  rows: z.array(z.array(z.string())).max(5000),
});

export type AskRequest = z.infer<typeof AskRequestSchema>;
