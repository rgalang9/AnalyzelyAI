"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { listAnalyses, loadAnalysis, type AnalysisSummary } from "@/lib/history";
import { useDataset } from "./dataset-context";
import { useUserEmail } from "./use-user-email";

function formatDate(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

// Left sidebar: "New analysis" for everyone, plus saved history for logged-in users.
// `onNavigate` closes the drawer on small screens after a click.
export default function Sidebar({ onNavigate }: { onNavigate: () => void }) {
  const { email, loading } = useUserEmail();
  const { analysisId, openDataset } = useDataset();
  const router = useRouter();
  const [items, setItems] = useState<AnalysisSummary[]>([]);
  const [listError, setListError] = useState("");
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [openError, setOpenError] = useState("");

  // Fetch the list when someone logs in, and again when a new analysis is saved
  useEffect(() => {
    if (!email) return;
    let ignore = false; // skip stale results if this runs again before finishing
    listAnalyses()
      .then((list) => {
        if (ignore) return;
        setItems(list);
        setListError("");
      })
      .catch((err) => {
        console.error("Couldn't load history:", err);
        if (!ignore) setListError("We couldn't load your history. Try refreshing the page.");
      });
    return () => {
      ignore = true;
    };
  }, [email, analysisId]);

  async function handleOpen(id: string) {
    setOpeningId(id);
    setOpenError("");
    try {
      const { dataset, answers, cleaning } = await loadAnalysis(id);
      openDataset(dataset, { analysisId: id, answers, cleaning });
      router.push("/dataset");
      onNavigate();
    } catch (err) {
      console.error("Couldn't open analysis:", err);
      setOpenError("We couldn't open that one. Please try again.");
    } finally {
      setOpeningId(null);
    }
  }

  return (
    <nav aria-label="Analysis history" className="flex h-full flex-col gap-6 p-4">
      <Link
        href="/upload"
        onClick={onNavigate}
        className="rounded-full bg-foreground px-4 py-2.5 text-center text-sm font-medium text-background transition-opacity hover:opacity-80"
      >
        + New analysis
      </Link>

      {!loading && !email && (
        <div className="rounded-2xl bg-zinc-100 p-4 text-sm dark:bg-zinc-900">
          <p className="font-medium">Log in to save your history</p>
          <p className="mt-1 text-zinc-600 dark:text-zinc-400">
            With an account, every file and question you ask is saved here so
            you can pick up where you left off.
          </p>
          <div className="mt-4 flex flex-col gap-2">
            <Link
              href="/signup"
              onClick={onNavigate}
              className="rounded-full bg-foreground px-4 py-2 text-center font-medium text-background hover:opacity-80"
            >
              Create an account
            </Link>
            <Link
              href="/login"
              onClick={onNavigate}
              className="rounded-full border border-zinc-300 px-4 py-2 text-center font-medium hover:bg-zinc-200 dark:border-zinc-700 dark:hover:bg-zinc-800"
            >
              Log in
            </Link>
          </div>
        </div>
      )}

      {email && (
        <div className="flex min-h-0 flex-1 flex-col">
          <h2 className="px-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
            Your history
          </h2>

          {listError && <p className="mt-3 px-2 text-sm text-red-600 dark:text-red-400">{listError}</p>}
          {openError && <p className="mt-3 px-2 text-sm text-red-600 dark:text-red-400">{openError}</p>}

          {!listError && items.length === 0 && (
            <p className="mt-3 px-2 text-sm text-zinc-500">
              Nothing saved yet. Upload a file and it&rsquo;ll show up here.
            </p>
          )}

          <ul className="mt-2 flex flex-col gap-1 overflow-y-auto">
            {items.map((item) => (
              <li key={item.id}>
                <button
                  onClick={() => handleOpen(item.id)}
                  disabled={openingId !== null}
                  aria-current={item.id === analysisId ? "page" : undefined}
                  className={`w-full rounded-lg px-2 py-2 text-left hover:bg-zinc-100 disabled:cursor-wait dark:hover:bg-zinc-900 ${
                    item.id === analysisId ? "bg-zinc-100 dark:bg-zinc-900" : ""
                  }`}
                >
                  <span className="block truncate text-sm font-medium" title={item.file_name}>
                    {item.file_name}
                  </span>
                  <span className="block text-xs text-zinc-500">
                    {openingId === item.id ? "Opening…" : formatDate(item.created_at)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </nav>
  );
}
