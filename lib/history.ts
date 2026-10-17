import { createClient } from "@/lib/supabase/client";
import type { Dataset } from "./parse-dataset";
import type { ChartData, StatResult } from "./dataset-stats";

// One question and the AI's answer, with stats and charts already calculated
export type Answer = {
  question: string;
  analysis: string;
  stats: StatResult[];
  charts: ChartData[];
};

// One entry in the sidebar's history list
export type AnalysisSummary = {
  id: string;
  file_name: string;
  created_at: string;
};

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

  // 2. A small row in the table makes it show up in the sidebar
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
    .select("id, file_name, created_at")
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw error;
  return data;
}

// Loads a saved analysis back: the dataset plus every past question and answer
export async function loadAnalysis(id: string): Promise<{ dataset: Dataset; answers: Answer[] }> {
  const supabase = createClient();

  const { data: analysis, error } = await supabase
    .from("analyses")
    .select("file_name, dataset_path")
    .eq("id", id)
    .single();
  if (error) throw error;

  const [file, messages] = await Promise.all([
    supabase.storage.from(BUCKET).download(analysis.dataset_path),
    supabase
      .from("analysis_messages")
      .select("question, analysis, stats, charts")
      .eq("analysis_id", id)
      .order("created_at", { ascending: true }),
  ]);
  if (file.error) throw file.error;
  if (messages.error) throw messages.error;

  const { headers, rows } = JSON.parse(await file.data.text());
  return {
    dataset: { fileName: analysis.file_name, headers, rows },
    answers: messages.data as Answer[],
  };
}
