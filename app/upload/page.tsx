"use client"; // runs in the browser so we can react to file picks and clicks

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { parseDataset } from "@/lib/parse-dataset";
import { saveNewAnalysis } from "@/lib/history";
import { checkCellCount, checkFileSize, type LimitProblem } from "@/lib/plans";
import { useDataset } from "../dataset-context";
import { UpgradeModal } from "./upgrade-modal";

const ALLOWED_EXTENSIONS = [".csv", ".xlsx"];

function hasAllowedExtension(fileName: string) {
  const lower = fileName.toLowerCase();
  return ALLOWED_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

export default function UploadPage() {
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState(false);
  const [limitProblem, setLimitProblem] = useState<LimitProblem | null>(null);
  const router = useRouter();
  const { openDataset } = useDataset();

  // Called when the user picks a file
  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const picked = event.target.files?.[0] ?? null;
    if (picked && !hasAllowedExtension(picked.name)) {
      setFile(null);
      setError(
        `"${picked.name}" isn't supported. Please upload a .csv or .xlsx file.`
      );
      event.target.value = ""; // clear the rejected file from the input
      return;
    }

    // Too big? Stop here, before uploading or reading it
    const sizeProblem = picked ? checkFileSize(picked.size) : null;
    if (sizeProblem) {
      setFile(null);
      setError("");
      setLimitProblem(sizeProblem);
      event.target.value = "";
      return;
    }

    setFile(picked);
    setError("");
  }

  // Called when the user clicks Submit
  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file) {
      setError("Please choose a .csv or .xlsx file first.");
      return;
    }

    setUploading(true);
    setError("");

    const formData = new FormData();
    formData.append("file", file);

    try {
      const response = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });
      const result = await response.json();

      if (!response.ok) {
        setError(result.error);
        setUploading(false);
        return;
      }
    } catch {
      setError("Something went wrong while uploading. Please try again.");
      setUploading(false);
      return;
    }

    // Upload accepted: read the file into rows
    let dataset;
    try {
      dataset = await parseDataset(file);
    } catch (err) {
      const reason = err instanceof Error ? err.message : "";
      setError(`We couldn't read "${file.name}". ${reason}`.trim());
      setUploading(false);
      return;
    }

    // Too many cells? Don't save or open it.
    const cellProblem = checkCellCount(
      dataset.rows.length * dataset.headers.length
    );
    if (cellProblem) {
      setLimitProblem(cellProblem);
      setUploading(false);
      return;
    }

    // Logged in? Save it to their history (guests get null, nothing saved).
    // If saving fails, they can still work with the file; we just let them know.
    let analysisId: string | null = null;
    let saveFailed = false;
    try {
      analysisId = await saveNewAnalysis(dataset);
    } catch (err) {
      console.error("Couldn't save analysis:", err);
      saveFailed = true;
    }

    openDataset(dataset, { analysisId, saveFailed });
    router.push("/dataset");
  }

  return (
    <main className="flex flex-1 flex-col items-center justify-center px-6 py-24">
      <div className="w-full max-w-md">
        <Link
          href="/"
          className="text-sm text-zinc-500 hover:text-foreground"
        >
          ← Back
        </Link>

        <h1 className="mt-4 text-3xl font-bold tracking-tight">
          Upload your dataset
        </h1>
        <p className="mt-2 text-zinc-600 dark:text-zinc-400">
          Accepted file types: .csv and .xlsx
        </p>

        <form onSubmit={handleSubmit} className="mt-8 flex flex-col gap-4">
          <input
            type="file"
            accept=".csv,.xlsx"
            onChange={handleFileChange}
            className="rounded-lg border border-zinc-300 p-3 text-sm file:mr-4 file:rounded-full file:border-0 file:bg-zinc-100 file:px-4 file:py-2 file:font-medium dark:border-zinc-700 dark:file:bg-zinc-800 dark:file:text-zinc-100"
          />

          {error && (
            <p role="alert" className="text-sm text-red-600 dark:text-red-400">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={!file || uploading}
            className="rounded-full bg-foreground px-6 py-3 font-medium text-background transition-opacity hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {uploading ? "Uploading..." : "Submit"}
          </button>
        </form>
      </div>

      {limitProblem && (
        <UpgradeModal
          problem={limitProblem}
          onClose={() => setLimitProblem(null)}
        />
      )}
    </main>
  );
}
