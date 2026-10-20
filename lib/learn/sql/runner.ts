// The SQL runner: a real SQLite database running inside the browser (sql.js).
// No server involved, so learners can't break anything.

import type { Database, SqlJsStatic, SqlValue } from "sql.js";

export type QueryResult = { columns: string[]; rows: SqlValue[][] };
export type TableInfo = { name: string; columns: { name: string; type: string }[] };

// The "inline" build has the database engine baked in, so no extra file needs serving.
// It's loaded once, the first time a lesson needs it.
let engine: Promise<SqlJsStatic> | null = null;
function loadEngine() {
  engine ??= import("sql.js/dist/sql-wasm-inline.js").then((m) => m.default());
  return engine;
}

// A brand-new database filled with the lesson's data (a fresh copy every time)
export async function createDatabase(setupSql: string): Promise<Database> {
  const SQL = await loadEngine();
  const db = new SQL.Database();
  db.run(setupSql);
  return db;
}

// Runs the learner's SQL and returns the last result table.
// Throws with SQLite's message if the SQL has a mistake.
export function runQuery(db: Database, sql: string): QueryResult {
  let last: QueryResult = { columns: [], rows: [] };
  for (const statement of db.iterateStatements(sql)) {
    const columns = statement.getColumnNames();
    const rows: SqlValue[][] = [];
    while (statement.step()) rows.push(statement.get());
    statement.free();
    if (columns.length > 0) last = { columns, rows }; // keep the last statement that returns a table
  }
  return last;
}

// Every row and column of one table, for previewing the data
export function readTable(db: Database, name: string): QueryResult {
  return runQuery(db, `SELECT * FROM "${name.replace(/"/g, '""')}"`);
}

export function describeTables(db: Database, tables: string[]): TableInfo[] {
  return tables.map((name) => {
    const info = runQuery(db, `PRAGMA table_info("${name.replace(/"/g, '""')}")`);
    return {
      name,
      columns: info.rows.map((row) => ({ name: String(row[1]), type: String(row[2] || "") })),
    };
  });
}

// ---------- Checking an answer ----------
// Compares result tables, not the SQL text, so any query that gets the right
// rows and columns counts. Column order doesn't matter; row order only matters
// when the answer uses ORDER BY.

const cellKey = (v: SqlValue) => (v === null ? "\u0000NULL" : v instanceof Uint8Array ? "\u0000BLOB" : String(v));
const rowKey = (row: SqlValue[]) => row.map(cellKey).join("\u0001");
const listNames = (names: string[]) => names.join(", ");

export function compareResults(
  actual: QueryResult,
  expected: QueryResult,
  answerSql: string
): { match: true } | { match: false; reason: string } {
  if (actual.columns.length !== expected.columns.length) {
    const n = expected.columns.length;
    return {
      match: false,
      reason: `Your result has ${actual.columns.length} column${actual.columns.length === 1 ? "" : "s"}, but we're looking for ${n} column${n === 1 ? "" : "s"}.`,
    };
  }

  // Line the learner's columns up with the expected ones by name
  const lower = actual.columns.map((c) => c.toLowerCase());
  const order = expected.columns.map((c) => lower.indexOf(c.toLowerCase()));
  if (order.includes(-1)) {
    return {
      match: false,
      reason: `Your columns are ${listNames(actual.columns)}, but we're looking for ${listNames(expected.columns)}.`,
    };
  }

  if (actual.rows.length !== expected.rows.length) {
    return {
      match: false,
      reason: `Your result has ${actual.rows.length} row${actual.rows.length === 1 ? "" : "s"}, but we're looking for ${expected.rows.length}.`,
    };
  }

  const actualKeys = actual.rows.map((row) => rowKey(order.map((i) => row[i])));
  const expectedKeys = expected.rows.map(rowKey);
  const sortedMatch = [...actualKeys].sort().join("\n") === [...expectedKeys].sort().join("\n");
  if (!sortedMatch) {
    return { match: false, reason: "The columns look right, but some of the rows are different." };
  }
  if (/\border\s+by\b/i.test(answerSql) && actualKeys.join("\n") !== expectedKeys.join("\n")) {
    return { match: false, reason: "You've got the right rows, but they're in a different order." };
  }
  return { match: true };
}
