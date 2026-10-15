import * as XLSX from "xlsx";

export type Dataset = {
  fileName: string;
  headers: string[];
  rows: string[][];
};

// Turns an uploaded .csv or .xlsx file into column headers + rows of text.
export async function parseDataset(file: File): Promise<Dataset> {
  const isCsv = file.name.toLowerCase().endsWith(".csv");

  // CSV: read as text and keep values exactly as written (raw: true),
  // so "00123" or "1/2/2024" aren't silently converted to numbers/dates.
  // XLSX: read the binary file; values come out as they'd display in Excel.
  const workbook = isCsv
    ? XLSX.read(await file.text(), { type: "string", raw: true })
    : XLSX.read(await file.arrayBuffer(), { type: "array" });

  // Use the first sheet in the file
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) throw new Error("This file has no data.");

  // header: 1 gives an array of rows, each row an array of cell values
  const allRows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: "",
    raw: false,
    blankrows: false,
  });
  if (allRows.length === 0) throw new Error("This file is empty.");

  const [headerRow, ...dataRows] = allRows;

  // Some rows can be wider than the header row, so use the widest row
  let columnCount = headerRow.length;
  for (const row of dataRows) columnCount = Math.max(columnCount, row.length);

  const headers = Array.from({ length: columnCount }, (_, i) => {
    const name = String(headerRow[i] ?? "").trim();
    return name || `Column ${i + 1}`; // fill in blank header names
  });

  const rows = dataRows.map((row) =>
    Array.from({ length: columnCount }, (_, i) => String(row[i] ?? ""))
  );

  return { fileName: file.name, headers, rows };
}
