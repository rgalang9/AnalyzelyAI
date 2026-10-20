import { z } from "zod";
import { ColumnProfileSchema } from "./analysis-schema";

// ---- What the browser sends to /api/clean ----
// Only summaries, a few sample rows, and the flagged cells: never the whole file.

export const FlaggedIssueSchema = z.object({
  id: z.string().max(100),
  row: z.number(), // 1-based, as the user sees it
  column: z.string().max(300).nullable(), // null = the whole row
  kind: z.string().max(40),
  value: z.string().max(300).nullable(),
  problem: z.string().max(500),
  code_fix: z.string().max(300).nullable(), // what the code checks suggested, if anything
  row_values: z.string().max(1000), // the rest of the row, for context
  above: z.string().max(300).nullable(), // value in the row above (same column)
  below: z.string().max(300).nullable(), // value in the row below (same column)
});

export const CleanRequestSchema = z.object({
  fileName: z.string().max(300),
  totalRows: z.number(),
  headers: z.array(z.string()).max(500),
  profile: z.array(ColumnProfileSchema).max(500),
  sampleRows: z.array(z.array(z.string().max(300))).max(50),
  issues: z.array(FlaggedIssueSchema).min(1).max(100),
});

export type FlaggedIssue = z.infer<typeof FlaggedIssueSchema>;
export type CleanRequest = z.infer<typeof CleanRequestSchema>;

// ---- What the AI sends back ----
// For missing values the AI only picks a fill *method*; the app calculates the
// actual value from the real data, so the AI never makes up numbers.

export const FIX_ACTIONS = [
  "set_value",
  "fill_median",
  "fill_mean",
  "fill_most_common",
  "fill_previous",
  "fill_next",
  "remove_row",
  "leave_as_is",
] as const;

export const IssueReviewSchema = z.object({
  id: z.string(),
  is_problem: z.boolean(),
  problem: z.string(),
  action: z.enum(FIX_ACTIONS),
  value: z.string().nullable(), // only for set_value
  advice: z.string(),
  certainty: z.enum(["confident", "suggestion"]),
});

export const CleaningReviewSchema = z.object({
  reviews: z.array(IssueReviewSchema),
});

export type IssueReview = z.infer<typeof IssueReviewSchema>;
