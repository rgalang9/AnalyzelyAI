// Runs Python for the Learn section, in the background so the page never freezes.
// Loaded by lib/learn/python/runner.ts as a module worker, which also stops it if code runs too long.
// Python itself (Pyodide) comes from jsDelivr; its version is set in runner.ts.
//
// Messages in:  { type: "init", version, pandas }   start Python (and pandas if the lesson needs it)
//               { type: "warm" }                   load pandas quietly in the background
//               { type: "run", id, files, setup, code, answer?, compare? }
// Messages out: { type: "progress", text, pct } · { type: "ready" } · { type: "failed", message }
//               { type: "started", id } · { type: "result", id, output, expected, check }

let pyodide = null;
let queue = Promise.resolve(); // runs happen one at a time, in order

const progress = (text, pct) => self.postMessage({ type: "progress", text, pct });

// The Python side: runs code on a clean slate, captures what it prints and shows,
// compares with the answer, and turns errors into plain words.
const HELPERS = String.raw`
import builtins, contextlib, io, json, math, re, sys, traceback
from pyodide.code import eval_code

MAX_ROWS = 200
YOUR_CODE = "<your code>"

class _InputNotAvailable(Exception):
    pass

def _no_input(*args, **kwargs):
    raise _InputNotAvailable()

# ---------- Showing results ----------

def _is_table(value):
    pd = sys.modules.get("pandas")
    return pd is not None and isinstance(value, (pd.DataFrame, pd.Series))

def _show_cell(v):
    pd = sys.modules["pandas"]
    try:
        if pd.api.types.is_scalar(v) and pd.isna(v):
            return None
    except (TypeError, ValueError):
        pass
    if isinstance(v, float):
        return repr(v)
    return str(v)

def _show_table(value):
    pd = sys.modules["pandas"]
    df = value.to_frame() if isinstance(value, pd.Series) else value
    head = df.head(MAX_ROWS)
    index = head.index
    names = [n for n in index.names if n is not None]
    return {
        "columns": [str(c) for c in head.columns],
        "index": [" / ".join(map(str, i)) if isinstance(i, tuple) else str(i) for i in index],
        "indexName": " / ".join(map(str, names)),
        "rows": [[_show_cell(v) for v in row] for row in head.itertuples(index=False, name=None)],
        "total": int(len(df)),
    }

# ---------- Running code ----------

def _line_of(error):
    if isinstance(error, SyntaxError):
        return error.lineno if error.filename == YOUR_CODE else None
    line = None
    for frame in traceback.extract_tb(error.__traceback__):
        if frame.filename == YOUR_CODE:
            line = frame.lineno
    return line

def _friendly(error):
    line = _line_of(error)
    at = f" (line {line})" if line else ""
    on_line = f"Line {line}" if line else "Your code"
    text = str(error)
    if isinstance(error, IndentationError):
        if "unexpected indent" in error.msg:
            return f"{on_line} starts with spaces Python didn't expect. Start the line at the left edge."
        return f"{on_line} needs to be indented (moved in with spaces) under the line before it."
    if isinstance(error, SyntaxError):
        msg = error.msg or ""
        if "unterminated string" in msg or "EOL while scanning" in msg:
            return f"{on_line} has text with a missing quote. Text needs a quote at the start and at the end."
        if "was never closed" in msg:
            return f"{on_line} has a bracket that's never closed. Check that every ( has a )."
        if "unmatched" in msg:
            return f"{on_line} has a closing bracket without an opening one."
        if "forgot a comma" in msg:
            return f"{on_line}: Python got confused here. Is a comma, a + or a quote missing?"
        return f"Python couldn't understand {on_line.lower() if line else 'your code'}. Check the spelling, brackets and quotes."
    if isinstance(error, NameError):
        m = re.search(r"name '(\w+)' is not defined", text)
        name = m.group(1) if m else "that"
        return f"Python doesn't know {name} yet{at}. Did you make it first, like {name} = ...? If it's text, put it in quotes."
    if isinstance(error, TypeError) and ("concatenate" in text or "unsupported operand" in text):
        return f"You're mixing text and numbers{at}. Text goes in quotes and numbers don't, so Python can't combine them as they are."
    if isinstance(error, ZeroDivisionError):
        return f"You can't divide by zero{at}."
    if isinstance(error, KeyError):
        return f"There's no column called {text}{at}. Check the spelling and capital letters."
    if isinstance(error, AttributeError):
        m = re.search(r"'(\w+)' object has no attribute '(\w+)'", text)
        if m:
            return f"A {m.group(1)} doesn't have anything called {m.group(2)}{at}. Check the spelling."
    if isinstance(error, FileNotFoundError):
        return f"There's no file called {error.filename}{at}. Check the name, like \"games.csv\"."
    if isinstance(error, ModuleNotFoundError):
        return f"There's no Python tool called {error.name} here{at}."
    if isinstance(error, SystemExit):
        return "exit() stops Python. You don't need it here."
    if isinstance(error, _InputNotAvailable):
        return f"input(){at} doesn't work here. Put the value straight into your code instead, like name = \"Sam\"."
    return f"{type(error).__name__}{at}: {text}"

def _run(setup, code):
    namespace = {"__name__": "__main__"}
    printed = io.StringIO()
    out = {"stdout": "", "table": None, "value": None, "error": None}
    value = None
    real_input = builtins.input
    builtins.input = _no_input
    try:
        with contextlib.redirect_stdout(printed), contextlib.redirect_stderr(printed):
            if setup.strip():
                eval_code(setup, namespace, filename="<setup>")
            value = eval_code(code, namespace, filename=YOUR_CODE)
        if value is not None:
            if _is_table(value):
                out["table"] = _show_table(value)
            else:
                out["value"] = repr(value)
    except BaseException as error:
        out["error"] = _friendly(error)
        value = None
    finally:
        builtins.input = real_input
    out["stdout"] = printed.getvalue()
    return out, value

# ---------- Checking an answer ----------

def _tokens(text):
    return [line.split() for line in text.strip().splitlines() if line.strip()]

def _same_token(a, b):
    if a == b:
        return True
    # Two decimal numbers that only differ by tiny rounding, like 0.30000000000000004 and 0.3
    if any(c in a for c in ".e") and any(c in b for c in ".e"):
        try:
            return math.isclose(float(a), float(b), rel_tol=1e-9, abs_tol=1e-12)
        except ValueError:
            return False
    return False

def _check_print(mine, expected):
    a, b = _tokens(mine["stdout"]), _tokens(expected["stdout"])
    if not a:
        return False, "Your code didn't print anything. Use print() to show the answer."
    if len(a) != len(b):
        n = len(b)
        return False, f"Your code printed {len(a)} line{'s' if len(a) != 1 else ''}, but we're looking for {n} line{'s' if n != 1 else ''}."
    for line_a, line_b in zip(a, b):
        if len(line_a) != len(line_b) or not all(_same_token(x, y) for x, y in zip(line_a, line_b)):
            return False, "Your output is a bit different from the expected output. Compare the two."
    return True, ""

def _as_frame(value):
    pd = sys.modules["pandas"]
    df = value.to_frame() if isinstance(value, pd.Series) else value.copy()
    # Row labels that hold real information (like group names) are compared as a column;
    # plain row numbers are ignored, so reset_index() or not doesn't matter
    if any(n is not None for n in df.index.names) or not pd.api.types.is_integer_dtype(df.index):
        df = df.reset_index()
    return df.reset_index(drop=True)

def _check_table(mine_value, expected_value):
    if not _is_table(mine_value):
        return False, "Your code doesn't end with a table. Put the table on the last line (like df.head()) so it shows up."
    pd = sys.modules["pandas"]
    a, b = _as_frame(mine_value), _as_frame(expected_value)
    ca, cb = [str(c) for c in a.columns], [str(c) for c in b.columns]
    if len(ca) != len(cb):
        n = len(cb)
        return False, f"Your table has {len(ca)} column{'s' if len(ca) != 1 else ''}, but we're looking for {n} column{'s' if n != 1 else ''}."
    if sorted(ca) != sorted(cb):
        return False, f"Your columns are {', '.join(ca)}, but we're looking for {', '.join(cb)}."
    if len(a) != len(b):
        return False, f"Your table has {len(a)} row{'s' if len(a) != 1 else ''}, but we're looking for {len(b)}."
    a.columns, b.columns = ca, cb
    a = a[cb]
    def same(x, y):
        try:
            pd.testing.assert_frame_equal(x, y, check_dtype=False, check_exact=False, rtol=1e-6, check_column_type=False, check_index_type=False)
            return True
        except AssertionError:
            return False
    if same(a, b):
        return True, ""
    try:
        if same(a.sort_values(cb).reset_index(drop=True), b.sort_values(cb).reset_index(drop=True)):
            return False, "You've got the right rows, but they're in a different order."
    except TypeError:
        pass
    return False, "The columns look right, but some of the values are different."

def az_run(setup, code, answer, compare):
    mine, mine_value = _run(setup, code)
    result = {"output": mine, "expected": None, "check": None}
    if answer is not None:
        expected, expected_value = _run(setup, answer)
        result["expected"] = expected
        if mine["error"]:
            result["check"] = {"match": False, "reason": mine["error"]}
        elif expected["error"]:
            result["check"] = {"match": False, "reason": "The lesson's own answer didn't run: " + expected["error"]}
        else:
            match, reason = _check_print(mine, expected) if compare == "print" else _check_table(mine_value, expected_value)
            result["check"] = {"match": match, "reason": reason}
    return json.dumps(result)
`;

async function init(version, pandas) {
  const base = `https://cdn.jsdelivr.net/pyodide/v${version}/full/`;
  progress("Downloading Python…", 10);
  const { loadPyodide } = await import(`${base}pyodide.mjs`);
  pyodide = await loadPyodide({ indexURL: base });
  progress("Starting Python…", 70);
  pyodide.runPython(HELPERS);
  if (pandas) {
    progress("Loading pandas…", 80);
    await pyodide.loadPackage(["pandas"]);
  }
  progress("Ready", 100);
  self.postMessage({ type: "ready" });
}

async function run({ id, files, setup, code, answer, compare }) {
  // A fresh copy of the lesson's CSV files every run, in case code changed them
  for (const [name, text] of Object.entries(files)) pyodide.FS.writeFile(`${name}.csv`, text);
  // Load whatever the code imports (like pandas) before running it. Code with a typo can't be
  // read for imports; that's fine, running it gives the friendly error message instead.
  for (const source of [setup, code, answer ?? ""]) {
    await pyodide.loadPackagesFromImports(source).catch(() => {});
  }
  self.postMessage({ type: "started", id }); // the time limit starts now, not while downloading
  const azRun = pyodide.globals.get("az_run");
  try {
    const result = JSON.parse(azRun(setup, code, answer ?? null, compare ?? null));
    self.postMessage({ type: "result", id, ...result });
  } finally {
    azRun.destroy();
  }
}

self.onmessage = (event) => {
  const msg = event.data;
  if (msg.type === "init") {
    init(msg.version, msg.pandas).catch((err) => self.postMessage({ type: "failed", message: String(err?.message ?? err) }));
  } else if (msg.type === "warm") {
    // Not in the run queue, so runs don't wait for it
    pyodide?.loadPackage(["pandas"]).catch(() => {});
  } else if (msg.type === "run") {
    queue = queue.then(() =>
      run(msg).catch((err) =>
        self.postMessage({
          type: "result",
          id: msg.id,
          output: { stdout: "", table: null, value: null, error: `Something went wrong inside Python: ${err?.message ?? err}` },
          expected: null,
          check: null,
        })
      )
    );
  }
};
