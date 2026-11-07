// The Python runner: real Python (Pyodide) running inside the browser, in a background
// worker (public/learn/python-worker.js) so a slow or endless loop can't freeze the page.
// No server involved, so learners can't break anything.
// One worker is shared by every Python lesson page, so Python only loads once per visit.

// Pinned so lessons always run on the same Python and pandas (Python 3.14, pandas 3.0)
export const PYODIDE_VERSION = "314.0.7";
const TIME_LIMIT_MS = 10_000;

export type PyTable = {
  columns: string[];
  index: string[]; // pandas' row labels (they start at 0); empty for a Series
  indexName: string;
  rows: (string | null)[][]; // null = empty (NaN)
  total: number; // rows in the full table (only the first 200 are sent)
  series: boolean; // a Series: shown as two columns (row labels, values)
};
export type PyOutput = {
  stdout: string; // what print() showed
  table: PyTable | null; // a table on the last line
  value: string | null; // anything else on the last line, like 42
  error: string | null; // a plain-words error message
  charts: string[]; // charts drawn, as PNG pictures (base64)
};
export type PyRunRequest = {
  files: Record<string, string>; // lesson CSVs: "games" → the file's text
  setup: string;
  code: string;
  answer?: string; // when given, the answer runs too and the two are compared
  compare?: "print" | "table" | "value" | "chart" | "any_text";
  variable?: string; // compare "any_text": the variable that must hold some text
};
// A table the lesson's setup makes (like df, or games and studios), for the side panel
export type PyTableInfo = { name: string; columns: { name: string; type: string }[]; data: PyTable };
export type PyRunResult =
  | { kind: "done"; output: PyOutput; expected: PyOutput | null; check: { match: boolean; reason: string } | null }
  | { kind: "stopped"; reason: "timeout" | "stop" };

export type PyStatus = {
  state: "idle" | "loading" | "ready" | "restarting" | "failed";
  text: string;
  pct: number;
};

type Pending = { resolve: (result: PyRunResult) => void; timer?: number };
type TablesJob = { resolve: (result: { tables: PyTableInfo[]; error: string | null }) => void };

let worker: Worker | null = null;
let status: PyStatus = { state: "idle", text: "", pct: 0 };
let wantPandas = false;
let wantCharts = false;
let nextId = 1;
let session = 0; // goes up each time a fresh Python starts (notebook variables are gone then)
let cellLesson: string | null = null;
const pending = new Map<number, Pending>();
const tableJobs = new Map<number, TablesJob>();
const listeners = new Set<(status: PyStatus) => void>();

function setStatus(next: PyStatus) {
  status = next;
  listeners.forEach((listen) => listen(status));
}

function start(restarting: boolean) {
  session++;
  worker = new Worker("/learn/python-worker.js", { type: "module" });
  setStatus({ state: restarting ? "restarting" : "loading", text: restarting ? "Restarting Python…" : "Downloading Python…", pct: 5 });
  worker.onmessage = (event) => {
    const msg = event.data;
    if (msg.type === "progress") {
      setStatus({ state: restarting ? "restarting" : "loading", text: restarting ? "Restarting Python…" : msg.text, pct: msg.pct });
    } else if (msg.type === "ready") {
      setStatus({ state: "ready", text: "Python is ready", pct: 100 });
      if (!wantPandas) worker?.postMessage({ type: "warm" }); // get pandas ready for later lessons
    } else if (msg.type === "failed") {
      console.error("Python didn't start:", msg.message);
      setStatus({ state: "failed", text: "We couldn't start Python. Check your internet connection and refresh the page.", pct: 0 });
    } else if (msg.type === "started") {
      // The code is running now (any packages are loaded), so the time limit starts
      const job = pending.get(msg.id);
      if (job) job.timer = window.setTimeout(() => restart("timeout"), TIME_LIMIT_MS);
    } else if (msg.type === "tables") {
      tableJobs.get(msg.id)?.resolve({ tables: msg.tables, error: msg.error ?? null });
      tableJobs.delete(msg.id);
    } else if (msg.type === "result") {
      const job = pending.get(msg.id);
      if (!job) return;
      clearTimeout(job.timer);
      pending.delete(msg.id);
      job.resolve({ kind: "done", output: msg.output, expected: msg.expected, check: msg.check });
    }
  };
  worker.onerror = (event) => {
    console.error("Python worker error:", event.message);
    setStatus({ state: "failed", text: "We couldn't start Python. Check your internet connection and refresh the page.", pct: 0 });
  };
  worker.postMessage({ type: "init", version: PYODIDE_VERSION, pandas: wantPandas, charts: wantCharts });
}

// Start loading Python in the background (safe to call many times).
// `pandas` / `charts`: the lesson needs pandas or matplotlib right away, so load them before
// saying "ready". (A worker that's already running loads them the first time code needs them.)
export function preloadPython(options: { pandas?: boolean; charts?: boolean } = {}) {
  if (typeof window === "undefined") return;
  if (options.pandas) wantPandas = true;
  if (options.charts) wantCharts = true;
  if (!worker) start(false);
}

export function getPythonStatus() {
  return status;
}

export function subscribePythonStatus(listen: (status: PyStatus) => void) {
  listeners.add(listen);
  return () => {
    listeners.delete(listen);
  };
}

// Throws away the worker (and anything still running in it) and starts a fresh one
function restart(reason: "timeout" | "stop") {
  worker?.terminate();
  worker = null;
  for (const [id, job] of pending) {
    clearTimeout(job.timer);
    job.resolve({ kind: "stopped", reason });
    pending.delete(id);
  }
  for (const [id, job] of tableJobs) {
    job.resolve({ tables: [], error: null });
    tableJobs.delete(id);
  }
  start(true);
}

// Runs code (and the answer, if given). Code that runs longer than 10 seconds is stopped.
export function runPython(request: PyRunRequest): Promise<PyRunResult> {
  return send("run", request);
}

// Notebook cells: like runPython, but every cell shares one Python session, so variables carry
// over. `reset` starts a fresh session (and runs `setup`) first.
export function runCell(request: PyRunRequest & { reset?: boolean }): Promise<PyRunResult> {
  return send("cell", request);
}

// Which notebook lesson's variables are in the shared session right now
export const getCellLesson = () => cellLesson;
export function setCellLesson(lessonId: string) {
  cellLesson = lessonId;
}

// Which Python session is running: a different number means Python restarted (Stop, time limit)
export function getPythonSession() {
  return session;
}

function send(type: "run" | "cell", request: PyRunRequest & { reset?: boolean }): Promise<PyRunResult> {
  preloadPython();
  const id = nextId++;
  return new Promise((resolve) => {
    pending.set(id, { resolve });
    worker!.postMessage({ type, id, ...request });
  });
}

// The tables a lesson's setup makes, with their columns, for the side panel
export function getSetupTables(files: Record<string, string>, setup: string) {
  preloadPython();
  const id = nextId++;
  return new Promise<{ tables: PyTableInfo[]; error: string | null }>((resolve) => {
    tableJobs.set(id, { resolve });
    worker!.postMessage({ type: "tables", id, files, setup });
  });
}

// The Stop button
export function stopPython() {
  if (pending.size > 0) restart("stop");
}
