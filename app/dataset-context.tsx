"use client";

import { createContext, useContext, useState } from "react";
import type { Dataset } from "@/lib/parse-dataset";
import type { Answer } from "@/lib/history";

// Shared memory for the dataset that's open right now, so the upload screen
// and the sidebar can hand it to the dataset screen. It lives in the browser
// tab, so a page refresh clears it (saved analyses can be reopened from the sidebar).
type DatasetContextValue = {
  dataset: Dataset | null;
  analysisId: string | null; // set when it's saved to the user's history
  answers: Answer[];
  saveFailed: boolean; // logged in, but saving to history didn't work
  openCount: number; // goes up each time a dataset is opened, to reset the screen
  openDataset: (
    dataset: Dataset,
    options?: { analysisId?: string | null; answers?: Answer[]; saveFailed?: boolean }
  ) => void;
  addAnswer: (answer: Answer) => void;
  clearDataset: () => void;
};

const DatasetContext = createContext<DatasetContextValue | null>(null);

type OpenState = Pick<DatasetContextValue, "dataset" | "analysisId" | "answers" | "saveFailed">;
const EMPTY: OpenState = { dataset: null, analysisId: null, answers: [], saveFailed: false };

export function DatasetProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<OpenState>(EMPTY);
  const [openCount, setOpenCount] = useState(0);

  const value: DatasetContextValue = {
    ...state,
    openCount,
    openDataset: (dataset, options = {}) => {
      setState({
        dataset,
        analysisId: options.analysisId ?? null,
        answers: options.answers ?? [],
        saveFailed: options.saveFailed ?? false,
      });
      setOpenCount((n) => n + 1);
    },
    addAnswer: (answer) => setState((s) => ({ ...s, answers: [...s.answers, answer] })),
    clearDataset: () => setState(EMPTY),
  };

  return <DatasetContext.Provider value={value}>{children}</DatasetContext.Provider>;
}

export function useDataset() {
  const value = useContext(DatasetContext);
  if (!value) throw new Error("useDataset must be used inside DatasetProvider");
  return value;
}
