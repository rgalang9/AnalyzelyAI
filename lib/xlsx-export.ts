import { downloadBlob, safeFileName } from "./download";
import { isCode, toNumber } from "./dataset-stats";

// A cell as Excel should store it: a real number when the text is one, otherwise the text
// (percentages and codes like zip codes stay as written)
function toCell(value: string): { value: string | number; money: boolean } {
  const text = value.trim();
  const n = toNumber(text);
  if (n === null || text.endsWith("%") || isCode(text)) return { value, money: false };
  return { value: n, money: /^-?\$/.test(text) };
}

// Sheet names: up to 31 characters, without [ ] : * ? / \
function sheetName(name: string): string {
  const cleaned = name
    .replace(/\.(csv|xlsx)$/i, "")
    .replace(/[[\]:*?/\\]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 31);
  return cleaned || "Data";
}

// Browser only: saves the table as an Excel file with one sheet named after the file.
// Headers are bold in row 1. `name` gets ".xlsx" added if needed.
export async function downloadXlsx(
  name: string,
  sheet: string,
  headers: string[],
  rows: string[][]
) {
  const { Workbook } = (await import("exceljs")).default; // loaded only when someone downloads
  const workbook = new Workbook();
  const worksheet = workbook.addWorksheet(sheetName(sheet), {
    views: [{ state: "frozen", ySplit: 1 }], // header row stays visible while scrolling
  });

  worksheet.addRow(headers).font = { bold: true };
  for (const row of rows) {
    const cells = row.map(toCell);
    const added = worksheet.addRow(cells.map((c) => c.value));
    cells.forEach((c, i) => {
      if (c.money) added.getCell(i + 1).numFmt = '"$"#,##0.00';
    });
  }

  // Column widths that fit most values (capped so one long cell doesn't make a huge column)
  headers.forEach((header, i) => {
    let longest = header.length;
    for (const row of rows.slice(0, 1000)) longest = Math.max(longest, (row[i] ?? "").length);
    worksheet.getColumn(i + 1).width = Math.min(50, Math.max(8, longest + 2));
  });

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  downloadBlob(safeFileName(name, ".xlsx"), blob);
}
