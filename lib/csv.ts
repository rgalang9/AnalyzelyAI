// Quote a cell for CSV if it contains commas, quotes, or line breaks
export function csvCell(value: string): string {
  return /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export function toCsv(headers: string[], rows: string[][]): string {
  return [headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\n");
}

// Browser only: saves a CSV file to the user's computer.
// The "﻿" at the start tells Excel the file is UTF-8, so accents etc. show correctly.
// The file is labelled as a plain download (not text) and the link is briefly added to the
// page before clicking: without both, some browsers show the CSV as text instead of saving it.
export function downloadCsv(fileName: string, headers: string[], rows: string[][]) {
  const blob = new Blob(["﻿" + toCsv(headers, rows)], { type: "application/octet-stream" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
