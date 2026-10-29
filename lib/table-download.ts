import { downloadCsv } from "./csv";
import { downloadXlsx } from "./xlsx-export";

export type DownloadFormat = "csv" | "xlsx";

// Saves a table as a .csv or .xlsx file. `sheet` names the Excel sheet (the original file name).
export async function downloadTable(
  format: DownloadFormat,
  name: string,
  sheet: string,
  headers: string[],
  rows: string[][]
) {
  if (format === "csv") downloadCsv(name, headers, rows);
  else await downloadXlsx(name, sheet, headers, rows);
}
