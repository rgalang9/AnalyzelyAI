// Runs Python for the Learn section, in the background so the page never freezes.
// Loaded by lib/learn/python/runner.ts as a module worker, which also stops it if code runs too long.
// Python itself (Pyodide) comes from jsDelivr; its version is set in runner.ts.
//
// Messages in:  { type: "init", version, pandas, charts }  start Python (plus pandas / matplotlib if needed)
//               { type: "warm" }                   load pandas quietly in the background
//               { type: "run", id, files, setup, code, answer?, compare? }
//               { type: "tables", id, files, setup }   the tables the setup makes, for the side panel
//               { type: "cell", id, files, setup, code, answer?, compare?, reset? }   notebook cells: one
//                 shared session, so variables carry over ("reset" starts a fresh one and runs setup)
// Messages out: { type: "progress", text, pct } · { type: "ready" } · { type: "failed", message }
//               { type: "started", id } · { type: "result", id, output, expected, check }
//               { type: "tables", id, tables }

let pyodide = null;
let queue = Promise.resolve(); // runs happen one at a time, in order

const progress = (text, pct) => self.postMessage({ type: "progress", text, pct });

// The Python side: runs code on a clean slate, captures what it prints and shows,
// compares with the answer, and turns errors into plain words.
const HELPERS = String.raw`
import base64, builtins, contextlib, io, json, math, os, re, sys, traceback
from pyodide.code import eval_code

os.environ["MPLBACKEND"] = "Agg"  # charts are drawn as pictures (there's no screen in a worker)

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

def _label(i):
    return " / ".join(map(str, i)) if isinstance(i, tuple) else str(i)

def _show_table(value):
    pd = sys.modules["pandas"]
    head = value.head(MAX_ROWS)
    names = [n for n in head.index.names if n is not None]
    if isinstance(value, pd.Series):
        # A Series is shown as two columns: its row labels, then its values
        return {
            "columns": [" / ".join(map(str, names)), "" if value.name is None else str(value.name)],
            "index": [],
            "indexName": "",
            "rows": [[_label(i), _show_cell(v)] for i, v in head.items()],
            "total": int(len(value)),
            "series": True,
        }
    return {
        "columns": [str(c) for c in head.columns],
        "index": [_label(i) for i in head.index],
        "indexName": " / ".join(map(str, names)),
        "rows": [[_show_cell(v) for v in row] for row in head.itertuples(index=False, name=None)],
        "total": int(len(value)),
        "series": False,
    }

# ---------- Charts ----------
# pandas' .plot() is watched so we know which kind of chart each one is (bar, line, …)

_chart_kinds = {}  # figure number → chart kind

def _watch_plots():
    pd = sys.modules.get("pandas")
    if pd is None or getattr(pd, "_az_watched", False):
        return
    from pandas.plotting import PlotAccessor
    real_call = PlotAccessor.__call__

    def remember(result, kind):
        first = result.flat[0] if hasattr(result, "flat") else result
        figure = getattr(first, "figure", None)
        if figure is not None:
            _chart_kinds[figure.number] = kind

    def call(self, *args, **kwargs):
        result = real_call(self, *args, **kwargs)
        remember(result, kwargs.get("kind") or "line")
        return result
    PlotAccessor.__call__ = call

    for owner in (pd.DataFrame, pd.Series):
        real_hist = owner.hist
        def hist(self, *args, _real=real_hist, **kwargs):
            result = _real(self, *args, **kwargs)
            remember(result, "hist")
            return result
        owner.hist = hist
    pd._az_watched = True

def _close_charts():
    _chart_kinds.clear()
    plt = sys.modules.get("matplotlib.pyplot")
    if plt is not None:
        plt.close("all")

def _describe(fig):
    # What a chart shows, worked out from what's drawn: kind and how many bars, points or lines
    from matplotlib.collections import PathCollection
    from matplotlib.container import BarContainer
    bars, points, lines, sideways, touching = 0, 0, 0, False, False
    for ax in fig.axes:
        for container in ax.containers:
            if isinstance(container, BarContainer):
                patches = list(container)
                bars += len(patches)
                sideways = sideways or getattr(container, "orientation", "vertical") == "horizontal"
                xs = sorted((p.get_x(), p.get_x() + p.get_width()) for p in patches)
                touching = touching or (len(xs) > 1 and all(math.isclose(a[1], b[0], abs_tol=1e-9) for a, b in zip(xs, xs[1:])))
        points += sum(len(c.get_offsets()) for c in ax.collections if isinstance(c, PathCollection))
        lines += sum(1 for l in ax.get_lines() if len(l.get_xdata()) > 1)
    kind = _chart_kinds.get(fig.number)
    if kind is None:
        kind = "hist" if bars and touching and not sideways else "barh" if bars and sideways else "bar" if bars else "scatter" if points else "line" if lines else "empty"
    if kind == "kde" or kind == "density":
        kind = "line"
    return {"kind": kind, "bars": bars, "points": points, "lines": lines}

def _collect_charts():
    plt = sys.modules.get("matplotlib.pyplot")
    images, charts = [], []
    if plt is None:
        return images, charts
    for number in plt.get_fignums():
        fig = plt.figure(number)
        buffer = io.BytesIO()
        fig.savefig(buffer, format="png", dpi=100, bbox_inches="tight")
        images.append(base64.b64encode(buffer.getvalue()).decode())
        charts.append(_describe(fig))
    _close_charts()
    return images, charts

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
    if isinstance(error, (TypeError, ValueError)) and ("'rand_'" in text or "'ror_'" in text or "'and_'" in text or "'or_'" in text or "truth value of a Series is ambiguous" in text):
        return f"When you join conditions with & or |, put each condition in its own brackets{at}, like (df[\"a\"] > 1) & (df[\"b\"] < 5). Use & and |, not and / or."
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

def _is_chart_object(value):
    # .plot() returns the chart's drawing area (or a grid of them); showing that as text is just noise
    first = value.flat[0] if type(value).__name__ == "ndarray" and value.size else value
    return (type(first).__module__ or "").startswith("matplotlib")

def _run(setup, code, namespace=None):
    if namespace is None:
        namespace = {"__name__": "__main__"}
    printed = io.StringIO()
    out = {"stdout": "", "table": None, "value": None, "error": None, "errorKind": None, "charts": []}
    value = None
    charts = []
    real_input = builtins.input
    builtins.input = _no_input
    _close_charts()
    try:
        with contextlib.redirect_stdout(printed), contextlib.redirect_stderr(printed):
            if setup.strip():
                eval_code(setup, namespace, filename="<setup>")
            _watch_plots()
            value = eval_code(code, namespace, filename=YOUR_CODE)
        if value is not None:
            if _is_table(value):
                out["table"] = _show_table(value)
            elif not _is_chart_object(value):
                out["value"] = repr(value)
    except BaseException as error:
        out["error"] = _friendly(error)
        out["errorKind"] = type(error).__name__
        value = None
    finally:
        builtins.input = real_input
        try:
            out["charts"], charts = _collect_charts()
        except Exception:
            _close_charts()
    out["stdout"] = printed.getvalue()
    return out, value, charts

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
            return False, _print_difference(" ".join(line_a), " ".join(line_b))
    return True, ""

def _print_difference(mine, wanted):
    # Says what's off without giving the answer away
    shown = mine if len(mine) <= 60 else mine[:57] + "..."
    if mine.lower() == wanted.lower():
        return f"You printed {shown}. Check the capital letters."
    squash = lambda text: re.sub(r"[\W_]+", "", text.lower())
    if squash(mine) == squash(wanted):
        return f"You printed {shown}. Check the spaces and punctuation."
    def number(text):
        try:
            return float(text)
        except ValueError:
            return None
    if number(mine) is not None and number(wanted) is not None:
        return f"You printed {shown}, but that's not the number we're looking for. Check the maths."
    return f"You printed {shown}, but that's not quite what we're looking for."

def _plural(n, word):
    return f"{n} {word}{'' if n == 1 else 's'}"

def _equal_tables(a, b, check_index=True):
    pd = sys.modules["pandas"]
    if not check_index:
        a, b = a.reset_index(drop=True), b.reset_index(drop=True)
    try:
        if isinstance(a, pd.Series):
            pd.testing.assert_series_equal(a, b, check_dtype=False, check_exact=False, rtol=1e-6, atol=1e-6, check_index_type=False, check_names=True)
        else:
            pd.testing.assert_frame_equal(a, b, check_dtype=False, check_exact=False, rtol=1e-6, atol=1e-6, check_column_type=False, check_index_type=False, check_names=True)
        return True
    except (AssertionError, TypeError, ValueError):
        return False

def _check_table(mine_value, expected_value):
    if not _is_table(mine_value):
        return False, "Your code doesn't end with a table. Put the table on the last line (like df.head()) so it shows up."
    pd = sys.modules["pandas"]
    a, b = mine_value, expected_value
    def same_after_reset(series, frame):
        try:
            flat = series.reset_index()
            return list(map(str, flat.columns)) == list(map(str, frame.columns)) and _equal_tables(flat, frame, check_index=False)
        except (TypeError, ValueError):
            return False
    if isinstance(b, pd.Series) and isinstance(a, pd.DataFrame):
        if same_after_reset(b, a):
            return False, "Your values are right, but this task wants them as a Series, with the groups as row labels. Leave out reset_index()."
        return False, "We're looking for a Series (one column of values with row labels), but your result is a DataFrame (a whole table). For one column, use single brackets like df[\"col\"]."
    if isinstance(b, pd.DataFrame) and isinstance(a, pd.Series):
        if same_after_reset(a, b):
            return False, "Your values are right, but this task wants a table with the groups as a column. Add .reset_index() at the end."
        return False, "We're looking for a DataFrame (a table), but your result is a Series (a single column). To keep it as a table, use double brackets like df[[\"col\"]]."

    if isinstance(b, pd.DataFrame):
        ca, cb = [str(c) for c in a.columns], [str(c) for c in b.columns]
        if len(ca) != len(cb):
            return False, f"Your table has {_plural(len(ca), 'column')}, but we're looking for {len(cb)}."
        if sorted(ca) != sorted(cb):
            return False, f"Your columns are {', '.join(ca)}, but we're looking for {', '.join(cb)}."
        a = a.copy()
        a.columns = ca
        a = a[cb]
        b = b.copy()
        b.columns = cb
    elif str(a.name) != str(b.name):
        return False, f"Your Series is called {a.name}, but we're looking for one called {b.name}."

    if len(a) != len(b):
        return False, f"Your result has {_plural(len(a), 'row')}, but we're looking for {len(b)}."
    if _equal_tables(a, b):
        return True, ""
    if _equal_tables(a, b, check_index=False):
        return False, "Your values are right, but the row labels (the index on the left) are different. Check reset_index(), set_index() or the sort order."
    try:
        sa = a.sort_values(list(a.columns)) if isinstance(a, pd.DataFrame) else a.sort_values()
        sb = b.sort_values(list(b.columns)) if isinstance(b, pd.DataFrame) else b.sort_values()
        if _equal_tables(sa, sb, check_index=False):
            return False, "You've got the right rows, but they're in a different order."
    except (TypeError, ValueError):
        pass
    return False, "The shape looks right, but some of the values are different."

def _plain(value):
    return value.item() if hasattr(value, "item") and not _is_table(value) else value

def _check_value(mine, mine_value, expected_value):
    if mine_value is None:
        if mine["stdout"].strip():
            return False, "You printed it. This task wants the value on its own on the last line, without print()."
        return False, "Your code doesn't end with a value. Put it on the last line so it shows up."
    if _is_table(expected_value):
        return _check_table(mine_value, expected_value)
    a, b = _plain(mine_value), _plain(expected_value)
    numbers = (int, float)
    if isinstance(a, numbers) and isinstance(b, numbers) and not isinstance(a, bool) and not isinstance(b, bool):
        if math.isclose(a, b, rel_tol=1e-6, abs_tol=1e-6):
            return True, ""
        return False, f"Your answer is {a!r}, but that's not quite the value we're looking for."
    if a == b:
        return True, ""
    return False, f"Your answer is {a!r}, but that's not quite the value we're looking for."

CHART_NAMES = {"bar": "a bar chart", "barh": "a sideways bar chart", "line": "a line chart", "hist": "a histogram", "scatter": "a scatter plot", "pie": "a pie chart", "box": "a box plot", "area": "an area chart", "empty": "an empty chart"}

def _check_chart(mine_charts, expected_charts):
    if not mine_charts:
        return False, "Your code didn't draw a chart. Use .plot(...) to make one."
    a, b = mine_charts[-1], expected_charts[-1]
    if a["kind"] != b["kind"]:
        return False, f"You drew {CHART_NAMES.get(a['kind'], a['kind'])}, but we're looking for {CHART_NAMES.get(b['kind'], b['kind'])}."
    what = {"bar": "bars", "barh": "bars", "hist": "bars", "scatter": "points"}.get(b["kind"], "lines")
    if a[what] != b[what]:
        return False, f"Your chart has {_plural(a[what], what[:-1])}, but we're looking for {b[what]}."
    return True, ""

def az_run(setup, code, answer, compare):
    mine, mine_value, mine_charts = _run(setup, code)
    result = {"output": mine, "expected": None, "check": None}
    if answer is not None:
        expected, expected_value, expected_charts = _run(setup, answer)
        result["expected"] = expected
        if mine["error"]:
            result["check"] = {"match": False, "reason": mine["error"]}
        elif expected["error"]:
            result["check"] = {"match": False, "reason": "The lesson's own answer didn't run: " + expected["error"]}
        else:
            if compare == "print":
                match, reason = _check_print(mine, expected)
            elif compare == "value":
                match, reason = _check_value(mine, mine_value, expected_value)
            elif compare == "chart":
                match, reason = _check_chart(mine_charts, expected_charts)
            else:
                match, reason = _check_table(mine_value, expected_value)
            result["check"] = {"match": match, "reason": reason}
    return json.dumps(result)

# ---------- Notebook cells: one shared session ----------

_session = None

def _copy_session(namespace):
    # A copy for trying the lesson's answer, so checking it can't change the learner's variables
    pd = sys.modules.get("pandas")
    copy = {}
    for name, value in namespace.items():
        copy[name] = value.copy() if pd is not None and isinstance(value, (pd.DataFrame, pd.Series)) else value
    return copy

QUOTES = "Put the name in quotes so Python knows it's text."

def az_cell(setup, code, answer, compare, reset, variable=None):
    global _session
    result = {"output": None, "expected": None, "check": None}
    if reset or _session is None:
        _session = {"__name__": "__main__"}
        if setup.strip():
            out, _, _ = _run(setup, "", _session)
            if out["error"]:
                result["output"] = out
                return json.dumps(result)
    if compare == "any_text":
        # Any text will do: the named variable just has to hold some (non-empty) text
        mine, _, _ = _run("", code, _session)
        result["output"] = mine
        held = _session.get(variable)
        if mine["errorKind"] == "NameError" or (not mine["error"] and not isinstance(held, str)):
            result["check"] = {"match": False, "reason": QUOTES}
        elif mine["error"]:
            result["check"] = {"match": False, "reason": mine["error"]}
        elif not held.strip():
            result["check"] = {"match": False, "reason": "Type a name between the quotes."}
        else:
            result["check"] = {"match": True, "reason": ""}
        return json.dumps(result)
    if answer is not None:
        expected, expected_value, expected_charts = _run("", answer, _copy_session(_session))
        result["expected"] = expected
    mine, mine_value, mine_charts = _run("", code, _session)
    result["output"] = mine
    if answer is not None:
        if mine["error"]:
            result["check"] = {"match": False, "reason": mine["error"]}
        elif expected["error"]:
            result["check"] = {"match": False, "reason": "The lesson's own answer didn't run: " + expected["error"]}
        else:
            if compare == "print":
                match, reason = _check_print(mine, expected)
            elif compare == "value":
                match, reason = _check_value(mine, mine_value, expected_value)
            elif compare == "chart":
                match, reason = _check_chart(mine_charts, expected_charts)
            else:
                match, reason = _check_table(mine_value, expected_value)
            result["check"] = {"match": match, "reason": reason}
    return json.dumps(result)

def az_tables(setup):
    # Every table (DataFrame) the setup makes, in the order it makes them, for the side panel
    namespace = {"__name__": "__main__"}
    tables = []
    try:
        with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
            if setup.strip():
                eval_code(setup, namespace, filename="<setup>")
    except BaseException as error:
        return json.dumps({"tables": [], "error": "The lesson's setup didn't run: " + _friendly(error)})
    finally:
        _close_charts()
    pd = sys.modules.get("pandas")
    if pd is not None:
        for name, value in namespace.items():
            if isinstance(value, pd.DataFrame) and not name.startswith("_"):
                tables.append({
                    "name": name,
                    "columns": [{"name": str(c), "type": str(t)} for c, t in value.dtypes.items()],
                    "data": _show_table(value),
                })
    return json.dumps({"tables": tables, "error": None})
`;

async function init(version, pandas, charts) {
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
  if (charts) {
    progress("Loading charts…", 90);
    await pyodide.loadPackage(["matplotlib"]);
  }
  progress("Ready", 100);
  self.postMessage({ type: "ready" });
}

// Charts: pandas' .plot() needs matplotlib, but there's no "import matplotlib" to spot
const DRAWS_CHART = /\.plot\b|\.hist\(|\bplt\b|matplotlib/;

// A fresh copy of the lesson's CSV files, then whatever the code needs (like pandas). Code with a
// typo can't be read for imports; that's fine, running it gives the friendly error message instead.
async function prepare(files, sources) {
  for (const [name, text] of Object.entries(files)) pyodide.FS.writeFile(`${name}.csv`, text);
  for (const source of sources) await pyodide.loadPackagesFromImports(source).catch(() => {});
  if (sources.some((source) => DRAWS_CHART.test(source))) await pyodide.loadPackage(["matplotlib"]);
}

async function run({ id, files, setup, code, answer, compare }) {
  await prepare(files, [setup, code, answer ?? ""]);
  self.postMessage({ type: "started", id }); // the time limit starts now, not while downloading
  const azRun = pyodide.globals.get("az_run");
  try {
    const result = JSON.parse(azRun(setup, code, answer ?? null, compare ?? null));
    self.postMessage({ type: "result", id, ...result });
  } finally {
    azRun.destroy();
  }
}

async function cell({ id, files, setup, code, answer, compare, reset, variable }) {
  await prepare(files, [setup, code, answer ?? ""]);
  self.postMessage({ type: "started", id });
  const azCell = pyodide.globals.get("az_cell");
  try {
    const result = JSON.parse(azCell(setup, code, answer ?? null, compare ?? null, !!reset, variable ?? null));
    self.postMessage({ type: "result", id, ...result });
  } finally {
    azCell.destroy();
  }
}

async function tables({ id, files, setup }) {
  await prepare(files, [setup]);
  const azTables = pyodide.globals.get("az_tables");
  try {
    self.postMessage({ type: "tables", id, ...JSON.parse(azTables(setup)) });
  } finally {
    azTables.destroy();
  }
}

self.onmessage = (event) => {
  const msg = event.data;
  if (msg.type === "init") {
    init(msg.version, msg.pandas, msg.charts).catch((err) => self.postMessage({ type: "failed", message: String(err?.message ?? err) }));
  } else if (msg.type === "tables") {
    queue = queue.then(() =>
      tables(msg).catch((err) => self.postMessage({ type: "tables", id: msg.id, tables: [], error: String(err?.message ?? err) }))
    );
  } else if (msg.type === "warm") {
    // Not in the run queue, so runs don't wait for it
    pyodide?.loadPackage(["pandas"]).catch(() => {});
  } else if (msg.type === "run" || msg.type === "cell") {
    queue = queue.then(() =>
      (msg.type === "cell" ? cell(msg) : run(msg)).catch((err) =>
        self.postMessage({
          type: "result",
          id: msg.id,
          output: { stdout: "", table: null, value: null, charts: [], error: `Something went wrong inside Python: ${err?.message ?? err}` },
          expected: null,
          check: null,
        })
      )
    );
  }
};
