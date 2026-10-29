"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  HISTORY_CHANGED,
  listAnalyses,
  loadAnalysis,
  type AnalysisSummary,
} from "@/lib/history";
import { useDataset } from "./dataset-context";

// Shared pieces for showing saved analyses as cards (Analyze page and My analyses)

export const nameOf = (item: AnalysisSummary) => item.title ?? item.file_name;

function formatDate(iso: string) {
  const date = new Date(iso);
  const sameYear = date.getFullYear() === new Date().getFullYear();
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: sameYear ? undefined : "numeric",
  });
}

// The logged-in user's saved analyses, newest first. Refreshes when an AI title
// arrives or after a rename/delete. Pass null (a guest) to skip loading.
export function useAnalysisList(email: string | null) {
  const [items, setItems] = useState<AnalysisSummary[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const [version, setVersion] = useState(0);

  useEffect(() => {
    const refresh = () => setVersion((v) => v + 1);
    window.addEventListener(HISTORY_CHANGED, refresh);
    return () => window.removeEventListener(HISTORY_CHANGED, refresh);
  }, []);

  useEffect(() => {
    if (!email) return;
    let ignore = false; // skip stale results if this runs again before finishing
    listAnalyses()
      .then((list) => {
        if (ignore) return;
        setItems(list);
        setError("");
      })
      .catch((err) => {
        console.error("Couldn't load analyses:", err);
        if (!ignore) setError("We couldn't load your analyses. Try refreshing the page.");
      })
      .finally(() => !ignore && setLoaded(true));
    return () => {
      ignore = true;
    };
  }, [email, version]);

  return { items, setItems, loaded, error, reload: () => setVersion((v) => v + 1) };
}

// Opens a saved analysis on the dataset screen
export function useOpenAnalysis() {
  const { openDataset } = useDataset();
  const router = useRouter();
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [openError, setOpenError] = useState("");

  async function open(id: string) {
    setOpeningId(id);
    setOpenError("");
    try {
      const { dataset, answers, cleaning } = await loadAnalysis(id);
      openDataset(dataset, { analysisId: id, answers, cleaning });
      router.push("/dataset");
    } catch (err) {
      console.error("Couldn't open analysis:", err);
      setOpenError("We couldn't open that one. Please try again.");
      setOpeningId(null);
    }
  }

  return { open, openingId, openError };
}

// Card colors take turns: purple, pink, orange. Each card is its own white box,
// so pink and orange never touch (color rule).
const THEMES = [
  { band: "bg-purple-light", ink: "text-purple" },
  { band: "bg-pink-light", ink: "text-pink" },
  { band: "bg-orange-light", ink: "text-orange" },
];

// Picks the same little chart for an analysis every time, based on its id
function shapeFor(id: string) {
  let sum = 0;
  for (const ch of id) sum += ch.charCodeAt(0);
  return sum % 3;
}

// Decoration only: a tiny line, dot or bar chart in the card's color
function MiniChart({ shape }: { shape: number }) {
  return (
    <svg viewBox="0 0 160 80" aria-hidden="true" className="h-20 w-40">
      {shape === 0 && (
        <polyline
          points="10,66 45,60 80,52 105,38 150,8"
          fill="none"
          stroke="currentColor"
          strokeWidth="5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
      {shape === 1 &&
        [
          [20, 58],
          [45, 34],
          [68, 48],
          [92, 22],
          [116, 40],
          [140, 12],
        ].map(([cx, cy]) => <circle key={cx} cx={cx} cy={cy} r="7" fill="currentColor" />)}
      {shape === 2 &&
        [
          [28, 48],
          [60, 30],
          [92, 38],
          [124, 8],
        ].map(([x, y]) => (
          <rect key={x} x={x} y={y} width="22" height={74 - y} rx="5" fill="currentColor" />
        ))}
    </svg>
  );
}

// One saved analysis. The whole card opens it; `menu` (the ⋯ button) sits on top.
export function AnalysisCard({
  item,
  index,
  opening,
  disabled,
  onOpen,
  menu,
}: {
  item: AnalysisSummary;
  index: number; // position in the list, picks the color
  opening: boolean;
  disabled: boolean;
  onOpen: () => void;
  menu?: React.ReactNode;
}) {
  const theme = THEMES[index % THEMES.length];
  const chipClass = "rounded-full bg-purple-light/60 px-2.5 py-1 text-xs font-medium text-grey";

  return (
    <div className="relative">
      <button
        type="button"
        onClick={onOpen}
        disabled={disabled}
        className="flex h-full w-full flex-col overflow-hidden rounded-2xl bg-white text-left shadow-[0_8px_30px_rgba(36,23,79,0.08)] transition-transform hover:-translate-y-1 disabled:cursor-wait"
      >
        <span className={`flex h-28 w-full items-center justify-center ${theme.band} ${theme.ink}`}>
          <MiniChart shape={shapeFor(item.id)} />
        </span>
        <span className="flex flex-1 flex-col p-5">
          <span
            className="line-clamp-2 font-display text-lg font-extrabold leading-snug text-navy"
            title={nameOf(item)}
          >
            {nameOf(item)}
          </span>
          <span className="mt-1 truncate text-sm text-grey">{item.file_name}</span>
          <span className="mt-4 flex flex-wrap gap-2">
            <span className={chipClass}>
              {item.row_count.toLocaleString()} rows × {item.column_count.toLocaleString()} cols
            </span>
            <span className={chipClass}>{opening ? "Opening…" : formatDate(item.created_at)}</span>
          </span>
        </span>
      </button>
      {menu && <div className="absolute right-3 top-3">{menu}</div>}
    </div>
  );
}
