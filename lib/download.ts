// Browser only: saves a file to the user's computer.
// The link is briefly added to the page before clicking: without that, some browsers
// show the file in a tab instead of saving it.
export function downloadBlob(fileName: string, blob: Blob) {
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

// A file name Mac and Windows both accept, always ending in `extension` (like ".csv"):
// characters like / \ : * ? " < > | become spaces, and an old extension such as ".xlsx" is dropped.
// 'Q3: "sales" report*-cleaned' → "Q3 sales report-cleaned.csv"
export function safeFileName(name: string, extension: string): string {
  const base = name
    .replace(/\.(csv|xlsx|xls|png)$/i, "")
    .replace(/[/\\:*?"<>|\u0000-\u001f]+/g, " ")
    .replace(/\s+/g, " ")
    .replace(/ -/g, "-")
    .trim()
    .replace(/^[.\s-]+|[.\s-]+$/g, "") // no leading or trailing dots, spaces or dashes
    .slice(0, 120);
  return `${base || "data"}${extension}`;
}
