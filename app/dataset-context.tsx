"use client";

import { createContext, useContext, useEffect, useRef, useState } from "react";
import type { Dataset } from "@/lib/parse-dataset";
import { saveCleaning, type Answer } from "@/lib/history";
import { needsReview, reviewIssues, type Cleaning } from "@/lib/cleaning";
import { findIssues } from "@/lib/data-checks";

// Shared memory for the dataset that's open right now, so the upload screen
// and the sidebar can hand it to the dataset screen. It lives in the browser
// tab, so a page refresh clears it (saved analyses can be reopened from the sidebar).
type DatasetContextValue = {
  dataset: Dataset | null; // always the original, as uploaded
  analysisId: string | null; // set when it's saved to the user's history
  answers: Answer[];
  saveFailed: boolean; // logged in, but saving to history didn't work
  cleaning: Cleaning | null; // problems found + which fixes are applied
  cleaningStatus: "scanning" | "done";
  cleaningNote: string; // e.g. the AI double-check couldn't run
  cleaningSaveFailed: boolean;
  openCount: number; // goes up each time a dataset is opened, to reset the screen
  openDataset: (
    dataset: Dataset,
    options?: {
      analysisId?: string | null;
      answers?: Answer[];
      saveFailed?: boolean;
      cleaning?: Cleaning | null;
    }
  ) => void;
  addAnswer: (answer: Answer) => void;
  setFixed: (issueIds: string[], fixed: boolean) => void;
  restoreOriginal: () => void;
  clearDataset: () => void;
};

const DatasetContext = createContext<DatasetContextValue | null>(null);

type OpenState = Pick<
  DatasetContextValue,
  | "dataset"
  | "analysisId"
  | "answers"
  | "saveFailed"
  | "cleaning"
  | "cleaningStatus"
  | "cleaningNote"
  | "cleaningSaveFailed"
>;
const EMPTY: OpenState = {
  dataset: null,
  analysisId: null,
  answers: [],
  saveFailed: false,
  cleaning: null,
  cleaningStatus: "done",
  cleaningNote: "",
  cleaningSaveFailed: false,
};

export function DatasetProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<OpenState>(EMPTY);
  const [openCount, setOpenCount] = useState(0);
  const openCountRef = useRef(0); // lets a slow scan check it's still for the open dataset
  const lastSavedCleaning = useRef<Cleaning | null>(null);

  // Logged in? Save cleaning results whenever they change (after the scan finishes)
  const { analysisId, cleaning, cleaningStatus } = state;
  useEffect(() => {
    if (!analysisId || !cleaning || cleaningStatus !== "done") return;
    if (cleaning === lastSavedCleaning.current) return;
    lastSavedCleaning.current = cleaning;
    saveCleaning(analysisId, cleaning).catch((err) => {
      console.error("Couldn't save cleaning:", err);
      setState((s) => (s.analysisId === analysisId ? { ...s, cleaningSaveFailed: true } : s));
    });
  }, [analysisId, cleaning, cleaningStatus]);

  // Code checks first (instant), then the AI double-checks them in the background
  async function scan(dataset: Dataset, count: number) {
    const isCurrent = () => openCountRef.current === count;
    const finish = (cleaning: Cleaning, note = "") => {
      if (isCurrent()) setState((s) => ({ ...s, cleaning, cleaningStatus: "done", cleaningNote: note }));
    };

    const issues = findIssues(dataset);
    if (!issues.some(needsReview)) return finish({ issues, fixedIds: [], aiReviewed: true });

    setState((s) => ({ ...s, cleaning: { issues, fixedIds: [], aiReviewed: false } }));
    try {
      finish({ issues: await reviewIssues(dataset, issues), fixedIds: [], aiReviewed: true });
    } catch (err) {
      console.error("AI review failed:", err);
      finish(
        { issues, fixedIds: [], aiReviewed: false },
        "Our AI double-check isn't available right now, so these come from basic checks only."
      );
    }
  }

  function updateFixedIds(change: (ids: string[]) => string[]) {
    setState((s) =>
      s.cleaning ? { ...s, cleaning: { ...s.cleaning, fixedIds: change(s.cleaning.fixedIds) } } : s
    );
  }

  const value: DatasetContextValue = {
    ...state,
    openCount,
    openDataset: (dataset, options = {}) => {
      const count = ++openCountRef.current;
      const cleaning = options.cleaning ?? null;
      lastSavedCleaning.current = cleaning; // already saved, no need to save it again
      setState({
        dataset,
        analysisId: options.analysisId ?? null,
        answers: options.answers ?? [],
        saveFailed: options.saveFailed ?? false,
        cleaning,
        cleaningStatus: cleaning ? "done" : "scanning",
        cleaningNote: "",
        cleaningSaveFailed: false,
      });
      setOpenCount(count);
      if (!cleaning) void scan(dataset, count);
    },
    addAnswer: (answer) => setState((s) => ({ ...s, answers: [...s.answers, answer] })),
    setFixed: (issueIds, fixed) =>
      updateFixedIds((ids) =>
        fixed ? [...new Set([...ids, ...issueIds])] : ids.filter((id) => !issueIds.includes(id))
      ),
    restoreOriginal: () => updateFixedIds(() => []),
    clearDataset: () => {
      openCountRef.current++; // ignore any scan still running for the old dataset
      setState(EMPTY);
    },
  };

  return <DatasetContext.Provider value={value}>{children}</DatasetContext.Provider>;
}

export function useDataset() {
  const value = useContext(DatasetContext);
  if (!value) throw new Error("useDataset must be used inside DatasetProvider");
  return value;
}
