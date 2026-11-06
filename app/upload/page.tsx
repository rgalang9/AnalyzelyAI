"use client"; // runs in the browser so we can react to file picks and clicks

import { useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, CircleAlert, LockKeyhole, Upload } from "lucide-react";
import { parseDataset } from "@/lib/parse-dataset";
import { autoTitleAnalysis, saveNewAnalysis } from "@/lib/history";
import {
  checkCellCount,
  checkFileSize,
  limitMessage,
  PLANS,
  type LimitProblem,
  type PlanId,
} from "@/lib/plans";
import { useDataset } from "../dataset-context";
import { useUserEmail } from "../use-user-email";
import { AnalysisCard, useAnalysisList, useOpenAnalysis } from "../analysis-cards";
import { chunkyPurple } from "../brand";
import UpgradePopup from "../upgrade-popup";
import { useUserPlan } from "../use-user-plan";

const ALLOWED_EXTENSIONS = [".csv", ".xlsx"];

function hasAllowedExtension(fileName: string) {
  const lower = fileName.toLowerCase();
  return ALLOWED_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

const RECENT_COUNT = 3;

// "free plan up to 3,000 cells and 2 MB", read from the plan limits
function planLimitsText(planId: PlanId) {
  const plan = PLANS[planId];
  const mb = plan.maxFileSizeBytes / (1024 * 1024);
  return `${plan.name.toLowerCase()} plan up to ${plan.maxCells.toLocaleString("en-US")} cells and ${mb} MB`;
}

export default function UploadPage() {
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [limitProblem, setLimitProblem] = useState<{ problem: LimitProblem; planId: PlanId } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const { openDataset } = useDataset();
  const { planId, loading: planLoading } = useUserPlan();

  // Next.js keeps this page alive in the background after you leave it, so it
  // would come back with the old file and "Uploading…". Reset it when it's hidden,
  // so it always opens fresh.
  useLayoutEffect(() => {
    const input = fileInputRef.current;
    return () => {
      setError("");
      setUploading(false);
      setDragging(false);
      setLimitProblem(null);
      if (input) input.value = "";
    };
  }, []);

  // Over the limit: offer a bigger plan, or just say so when they're already on the biggest
  function showLimit(problem: LimitProblem, plan: PlanId) {
    if (plan === "premium") setError(limitMessage(problem));
    else setLimitProblem({ problem, planId: plan });
  }

  // Called when the user chooses a file or drops one on the box: check it, then upload
  async function handlePicked(picked: File) {
    if (uploading) return;
    if (!hasAllowedExtension(picked.name)) {
      setError(
        `"${picked.name}" isn't supported. Please upload a .csv or .xlsx file.`
      );
      return;
    }

    // Too big? Stop here, before uploading or reading it
    // (if their plan hasn't loaded yet, the server still checks the size)
    const sizeProblem = planLoading ? null : checkFileSize(picked.size, PLANS[planId]);
    if (sizeProblem) {
      setError("");
      showLimit(sizeProblem, planId);
      return;
    }

    setUploading(true);
    setError("");
    try {
      await upload(picked);
    } catch (err) {
      // Anything unexpected: never leave the page stuck on "Uploading…"
      console.error("Upload failed:", err);
      setError("Something went wrong while uploading. Please try again.");
      setUploading(false);
    }
  }

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const picked = event.target.files?.[0];
    event.target.value = ""; // so choosing the same file again still works
    if (picked) void handlePicked(picked);
  }

  function handleDrop(event: React.DragEvent) {
    event.preventDefault();
    setDragging(false);
    const dropped = event.dataTransfer.files[0];
    if (dropped) void handlePicked(dropped);
  }

  async function upload(file: File) {
    const formData = new FormData();
    formData.append("file", file);

    let uploadPlan: PlanId;
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
      uploadPlan = result.planId; // the server looks up their plan
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
      dataset.rows.length * dataset.headers.length,
      PLANS[uploadPlan]
    );
    if (cellProblem) {
      showLimit(cellProblem, uploadPlan);
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

    // Saved? Ask the AI for a short title in the background (no waiting)
    if (analysisId) void autoTitleAnalysis(analysisId, dataset);

    openDataset(dataset, { analysisId, saveFailed });
    router.push("/dataset");
  }

  return (
    <main className="flex flex-1 flex-col bg-white bg-linear-to-b from-purple-light/30 to-purple-light/30 px-4 py-10 text-navy sm:px-6 sm:py-14">
      <div className="mx-auto w-full max-w-6xl">
        <h1 className="font-display text-3xl font-extrabold tracking-tight sm:text-5xl">
          What do you want to <span className="text-purple">analyze</span> today?
        </h1>
        <p className="mt-3 text-grey sm:text-lg">
          Upload a spreadsheet, then ask questions in plain English.
        </p>

        {/* Drop zone: drag a file onto it, or use the button */}
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          className={`mt-8 flex flex-col items-center rounded-3xl border-2 border-dashed px-6 py-12 text-center transition-colors sm:py-14 ${
            dragging ? "border-purple bg-purple-light/60" : "border-purple/40 bg-white"
          }`}
        >
          <span className="flex size-16 items-center justify-center rounded-2xl bg-purple-light text-purple">
            <Upload aria-hidden="true" className="size-7" />
          </span>
          <h2 className="mt-5 font-display text-xl font-extrabold sm:text-2xl">
            {uploading ? "Uploading…" : "Drag & drop your file here"}
          </h2>
          <p className="mt-2 text-sm text-grey sm:text-base">
            CSV or Excel (.xlsx) · {planLimitsText(planId)}
          </p>

          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.xlsx"
            onChange={handleFileChange}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className={`${chunkyPurple} mt-7 disabled:cursor-wait disabled:opacity-60`}
          >
            {uploading ? "Uploading…" : "Choose a file"}
          </button>

          {error && (
            <p
              role="alert"
              className="mt-6 flex max-w-md items-start gap-2 rounded-xl bg-pink-light px-4 py-3 text-left text-sm text-navy"
            >
              <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-pink" />
              {error}
            </p>
          )}
        </div>

        <RecentAnalyses />
      </div>

      {limitProblem && (
        <UpgradePopup
          currentPlan={limitProblem.planId}
          heading="This file's a big one! 📊"
          message={`${limitProblem.problem.detail}, and the ${limitProblem.problem.planName} limit is ${limitProblem.problem.limit}.`}
          onClose={() => setLimitProblem(null)}
        />
      )}
    </main>
  );
}

// "Your recent analyses": the newest few for logged-in users, a log-in nudge for guests
function RecentAnalyses() {
  const { email, loading } = useUserEmail();
  const { items, loaded, error } = useAnalysisList(email);
  const { open, openingId, openError } = useOpenAnalysis();

  if (loading) return null;

  if (!email) {
    return (
      <section className="mt-12 flex flex-col items-start gap-4 rounded-2xl bg-white p-6 shadow-[0_8px_30px_rgba(36,23,79,0.08)] sm:flex-row sm:items-center">
        <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-purple-light text-purple">
          <LockKeyhole aria-hidden="true" className="size-6" />
        </span>
        <div className="flex-1">
          <h2 className="font-display text-lg font-extrabold">Log in to ask AI questions</h2>
          <p className="mt-1 text-sm text-grey">
            You can upload and preview files without an account. A free account lets you ask AI
            questions and saves your work.
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/login"
            className="rounded-full border-2 border-navy px-5 py-2 text-sm font-bold hover:bg-purple-light/60"
          >
            Log in
          </Link>
          <Link
            href="/signup"
            className="rounded-full bg-purple px-5 py-2 text-sm font-bold text-white shadow-[0_4px_0_var(--color-purple-dark)] transition-all active:translate-y-[2px] active:shadow-[0_2px_0_var(--color-purple-dark)]"
          >
            Sign up
          </Link>
        </div>
      </section>
    );
  }

  const recent = items.slice(0, RECENT_COUNT);

  return (
    <section className="mt-12">
      <div className="flex items-end justify-between gap-4">
        <h2 className="font-display text-2xl font-extrabold tracking-tight sm:text-3xl">
          Your recent analyses
        </h2>
        <Link
          href="/analyses"
          className="flex shrink-0 items-center gap-1 font-bold text-purple hover:underline"
        >
          See all <ArrowRight aria-hidden="true" className="size-4" />
        </Link>
      </div>

      {(error || openError) && (
        <p
          role="alert"
          className="mt-4 flex items-start gap-2 rounded-xl bg-pink-light px-4 py-3 text-sm text-navy"
        >
          <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-pink" />
          {error || openError}
        </p>
      )}
      {loaded && !error && recent.length === 0 && (
        <p className="mt-4 text-grey">Nothing saved yet. Upload a file and it&rsquo;ll show up here.</p>
      )}

      <div className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {recent.map((item, i) => (
          <AnalysisCard
            key={item.id}
            item={item}
            index={i}
            opening={openingId === item.id}
            disabled={openingId !== null}
            onOpen={() => open(item.id)}
          />
        ))}
      </div>
    </section>
  );
}
