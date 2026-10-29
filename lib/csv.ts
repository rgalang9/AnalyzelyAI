import { downloadBlob, safeFileName } from "./download";

// Quote a cell for CSV if it contains commas, quotes, or line breaks
export function csvCell(value: string): string {
  return /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export function toCsv(headers: string[], rows: string[][]): string {
  return [headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\n");
}

// Browser only: saves a CSV file to the user's computer. `name` gets ".csv" added if needed.
// Labelled as a CSV so Chrome keeps the .csv ending. The "﻿" at the start tells Excel
// the file is UTF-8, so accents etc. show correctly.
export function downloadCsv(name: string, headers: string[], rows: string[][]) {
  const blob = new Blob(["﻿" + toCsv(headers, rows)], { type: "text/csv;charset=utf-8" });
  downloadBlob(safeFileName(name, ".csv"), blob);
}
