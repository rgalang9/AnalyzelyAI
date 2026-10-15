"use client";

import { createContext, useContext, useState } from "react";
import type { Dataset } from "@/lib/parse-dataset";

// Shared memory so the upload screen can hand the parsed dataset to the
// dataset screen. Note: it lives in the browser tab, so a page refresh clears it.
type DatasetContextValue = {
  dataset: Dataset | null;
  setDataset: (dataset: Dataset | null) => void;
};

const DatasetContext = createContext<DatasetContextValue | null>(null);

export function DatasetProvider({ children }: { children: React.ReactNode }) {
  const [dataset, setDataset] = useState<Dataset | null>(null);
  return (
    <DatasetContext.Provider value={{ dataset, setDataset }}>
      {children}
    </DatasetContext.Provider>
  );
}

export function useDataset() {
  const value = useContext(DatasetContext);
  if (!value) throw new Error("useDataset must be used inside DatasetProvider");
  return value;
}
