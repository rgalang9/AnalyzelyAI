import { downloadBlob } from "./download";

// Quote a cell for CSV if it contains commas, quotes, or line breaks
export function csvCell(value: string): string {
  return /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export function toCsv(headers: string[], rows: string[][]): string {
  return [headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\n");
}

// Browser only: saves a CSV file to the user's computer.
// The "﻿" at the start tells Excel the file is UTF-8, so accents etc. show correctly.
// It's labelled as a plain download (not text) so browsers save it instead of showing it.
export function downloadCsv(fileName: string, headers: string[], rows: string[][]) {
  const blob = new Blob(["﻿" + toCsv(headers, rows)], { type: "application/octet-stream" });
  downloadBlob(fileName, blob);
}
