import { createClient } from "@/lib/supabase/client";
import type { Dataset } from "./parse-dataset";
import type { ChartData, StatResult } from "./dataset-stats";
import type { Cleaning, Issue } from "./cleaning";

// One question and the AI's answer, with stats and charts already calculated
export type Answer = {
  question: string;
  analysis: string;
  stats: StatResult[];
  charts: ChartData[];
};

// One entry in the history list (the analysis cards)
export type AnalysisSummary = {
  id: string;
  file_name: string;
  title: string | null; // null = no title yet, show the file name
  created_at: string;
  row_count: number;
  column_count: number;
};

// The analysis cards listen for this to refresh the list (e.g. when an AI title arrives)
export const HISTORY_CHANGED = "analyzely:history-changed";
const announceHistoryChange = () => window.dispatchEvent(new Event(HISTORY_CHANGED));

const BUCKET = "datasets";

// Saves a freshly uploaded dataset to the logged-in user's history.
// Returns the new analysis id, or null for guests (nothing is saved for them).
export async function saveNewAnalysis(dataset: Dataset): Promise<string | null> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const id = crypto.randomUUID();
  const path = `${user.id}/${id}.json`; // each user has their own folder

  // 1. The rows go into Storage, since they can be too big for a table row
  const file = new Blob([JSON.stringify({ headers: dataset.headers, rows: dataset.rows })], {
    type: "application/json",
  });
  const upload = await supabase.storage.from(BUCKET).upload(path, file);
  if (upload.error) throw upload.error;

  // 2. A small row in the table makes it show up in My analyses
  const { error } = await supabase.from("analyses").insert({
    id,
    file_name: dataset.fileName,
    row_count: dataset.rows.length,
    column_count: dataset.headers.length,
    dataset_path: path,
  });
  if (error) throw error;

  return id;
}

export async function saveAnswer(analysisId: string, answer: Answer) {
  const { error } = await createClient()
    .from("analysis_messages")
    .insert({ analysis_id: analysisId, ...answer });
  if (error) throw error;
}

// The logged-in user's past analyses, newest first (RLS only returns their own)
export async function listAnalyses(): Promise<AnalysisSummary[]> {
  const { data, error } = await createClient()
    .from("analyses")
    .select("id, file_name, title, created_at, row_count, column_count")
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw error;
  return data;
}

// Asks the AI for a short title from a small sample (file name, column names, first 5 rows)
// and saves it. If anything fails, the entry simply keeps showing its file name.
const TITLE_SAMPLE_ROWS = 5;
const TITLE_MAX_COLUMNS = 100;
const clip = (v: string) => v.slice(0, 200);

export async function autoTitleAnalysis(analysisId: string, dataset: Dataset) {
  try {
    const response = await fetch("/api/title", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fileName: dataset.fileName.slice(0, 300),
        headers: dataset.headers.slice(0, TITLE_MAX_COLUMNS).map(clip),
        rows: dataset.rows
          .slice(0, TITLE_SAMPLE_ROWS)
          .map((row) => row.slice(0, TITLE_MAX_COLUMNS).map(clip)),
      }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error);

    // Only if the user hasn't renamed it in the meantime
    const { error } = await createClient()
      .from("analyses")
      .update({ title: result.title })
      .eq("id", analysisId)
      .eq("title_is_custom", false);
    if (error) throw error;
    announceHistoryChange();
  } catch (err) {
    console.error("Couldn't create an AI title (keeping the file name):", err);
  }
}

// The saved title of one analysis (null = no title yet, show the file name)
export async function getAnalysisTitle(analysisId: string): Promise<string | null> {
  const { data, error } = await createClient()
    .from("analyses")
    .select("title")
    .eq("id", analysisId)
    .single();
  if (error) throw error;
  return data.title;
}

export async function renameAnalysis(analysisId: string, title: string) {
  const { error } = await createClient()
    .from("analyses")
    .update({ title, title_is_custom: true })
    .eq("id", analysisId);
  if (error) throw error;
  announceHistoryChange();
}

// Deletes an analysis. Its messages and cleaning results go with it (the database
// cascades the delete), and then its saved dataset file is removed from Storage.
export async function deleteAnalysis(analysisId: string) {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("analyses")
    .delete()
    .eq("id", analysisId)
    .select("dataset_path")
    .single();
  if (error) throw error;

  const removed = await supabase.storage.from(BUCKET).remove([data.dataset_path]);
  // The entry is already gone; a leftover file is harmless, so just log it
  if (removed.error) console.error("Couldn't remove the dataset file:", removed.error);
  announceHistoryChange();
}

// Saves the data-cleaning results (issues found + which fixes are applied).
// Saves run one after another, so a quick Fix then Undo can't arrive out of order.
let cleaningSaves = Promise.resolve();

export function saveCleaning(analysisId: string, cleaning: Cleaning): Promise<void> {
  const save = cleaningSaves.then(async () => {
    const { error } = await createClient().from("analysis_cleanings").upsert({
      analysis_id: analysisId,
      issues: cleaning.issues,
      fixed_issue_ids: cleaning.fixedIds,
      ai_reviewed: cleaning.aiReviewed,
      updated_at: new Date().toISOString(),
    });
    if (error) throw error;
  });
  cleaningSaves = save.catch(() => {}); // a failed save shouldn't block the next one
  return save;
}

// Loads a saved analysis back: the dataset, every past question and answer,
// and the cleaning results (null for analyses saved before cleaning existed)
export async function loadAnalysis(
  id: string
): Promise<{ dataset: Dataset; answers: Answer[]; cleaning: Cleaning | null }> {
  const supabase = createClient();

  const { data: analysis, error } = await supabase
    .from("analyses")
    .select("file_name, dataset_path")
    .eq("id", id)
    .single();
  if (error) throw error;

  const [file, messages, cleaning] = await Promise.all([
    supabase.storage.from(BUCKET).download(analysis.dataset_path),
    supabase
      .from("analysis_messages")
      .select("question, analysis, stats, charts")
      .eq("analysis_id", id)
      .order("created_at", { ascending: true }),
    supabase
      .from("analysis_cleanings")
      .select("issues, fixed_issue_ids, ai_reviewed")
      .eq("analysis_id", id)
      .maybeSingle(),
  ]);
  if (file.error) throw file.error;
  if (messages.error) throw messages.error;
  if (cleaning.error) throw cleaning.error;

  const { headers, rows } = JSON.parse(await file.data.text());
  return {
    dataset: { fileName: analysis.file_name, headers, rows },
    answers: messages.data as Answer[],
    cleaning: cleaning.data && {
      issues: cleaning.data.issues as Issue[],
      fixedIds: cleaning.data.fixed_issue_ids,
      aiReviewed: cleaning.data.ai_reviewed,
    },
  };
}
