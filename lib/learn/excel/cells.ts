// Cell addresses like "D2" and ranges like "D2:D6"

export const CELL_RE = /^[A-Z]{1,3}[1-9]\d*$/;
export const RANGE_RE = /^[A-Z]{1,3}[1-9]\d*(:[A-Z]{1,3}[1-9]\d*)?$/;

// "D2" → { col: 3, row: 1 } (both start at 0)
export function parseCell(a1: string) {
  const [, letters, digits] = a1.match(/^([A-Z]+)(\d+)$/)!;
  const col = [...letters].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1;
  return { col, row: Number(digits) - 1 };
}

export function cellName(col: number, row: number) {
  let letters = "";
  for (let n = col + 1; n > 0; n = Math.floor((n - 1) / 26)) letters = String.fromCharCode(65 + ((n - 1) % 26)) + letters;
  return `${letters}${row + 1}`;
}

// Two ranges cover the same cells ("A1:A5" and "A5:A1"; "C4" and "C4:C4")
export function sameRange(a: string, b: string): boolean {
  if (!RANGE_RE.test(a) || !RANGE_RE.test(b)) return false;
  const corners = (r: string) => {
    const [from, to = from] = r.split(":").map(parseCell);
    return [Math.min(from.col, to.col), Math.min(from.row, to.row), Math.max(from.col, to.col), Math.max(from.row, to.row)].join();
  };
  return corners(a) === corners(b);
}

// Every cell in a range, row by row: "D2:E3" → ["D2", "E2", "D3", "E3"]
export function cellsIn(range: string): string[] {
  const [from, to = from] = range.split(":").map(parseCell);
  const cells: string[] = [];
  for (let row = Math.min(from.row, to.row); row <= Math.max(from.row, to.row); row++) {
    for (let col = Math.min(from.col, to.col); col <= Math.max(from.col, to.col); col++) cells.push(cellName(col, row));
  }
  return cells;
}
