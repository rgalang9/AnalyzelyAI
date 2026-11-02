// Checking an R task by its RESULT, not by how the code is written: an object's value, a data
// frame's columns and rows, the printed output, or the last ggplot's geom, aes, facets and title.
// Also turns R's error messages into plain English.

import type { RCheck } from "../lesson-types";
import type { RObjectInfo, RPlotInfo } from "./runner";

// pass: done. wait: not there yet (a friendly note, not a miss). wrong: a real miss, with why.
export type RGrade = { status: "pass" } | { status: "wait"; note: string } | { status: "wrong"; message: string };

type Cell = string | number | boolean | null;
type Frame = { names: string[]; columns: Cell[][]; nrow: number };

const close = (a: number, b: number) => Math.abs(a - b) <= 0.01 + 1e-9;

// Numbers within 0.01, text exactly, NA as null
function sameCell(got: Cell, want: Cell): boolean {
  if (want === null || got === null) return got === want;
  if (typeof want === "number") return typeof got === "number" ? close(got, want) : Number.isFinite(Number(got)) && close(Number(got), want);
  if (typeof want === "boolean") return got === want;
  return String(got) === want;
}

const show = (v: Cell) => (v === null ? "NA" : typeof v === "string" ? `"${v}"` : typeof v === "boolean" ? (v ? "TRUE" : "FALSE") : String(Number(v.toFixed(4))));
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

function gradeValue(name: string, want: Cell | Cell[], info: RObjectInfo): RGrade {
  if (!info.exists) return { status: "wait", note: `Save your answer as ${name}, like ${name} <- …, then run it.` };
  if (info.is_df) return { status: "wrong", message: `${name} is a data frame, but this task wants a value. Try pull() or $ to take one column.` };
  if (!Array.isArray(info.value)) return { status: "wrong", message: `${name} is a ${info.class[0]}, but this task wants a value.` };
  const got = info.value as Cell[];
  const wanted = Array.isArray(want) ? want : [want];
  if (got.length !== wanted.length)
    return { status: "wrong", message: `${name} has ${plural(got.length, "value")}, but should have ${wanted.length}.` };
  const i = wanted.findIndex((w, k) => !sameCell(got[k], w));
  if (i < 0) return { status: "pass" };
  return {
    status: "wrong",
    message: wanted.length === 1 ? `${name} is ${show(got[0])}, which isn't right yet.` : `Value ${i + 1} of ${name} is ${show(got[i])}, which isn't right yet.`,
  };
}

function gradeFrame(check: Extract<RCheck, { type: "data_frame" }>, info: RObjectInfo): RGrade {
  const { name } = check;
  if (!info.exists) return { status: "wait", note: `Save your table as ${name}, like ${name} <- …, then run it.` };
  if (!info.is_df) return { status: "wrong", message: `${name} should be a data frame (a table), but it's a ${info.class[0]}.` };
  const frame = info.value as Frame;
  const missing = check.columns.find((c) => !frame.names.includes(c));
  if (missing) return { status: "wrong", message: `Column '${missing}' is missing.` };
  const extra = frame.names.filter((c) => !check.columns.includes(c));
  if (extra.length > 0)
    return { status: "wrong", message: `${name} has an extra column '${extra[0]}'. It should only have: ${check.columns.join(", ")}.` };
  if (frame.nrow !== check.rows.length)
    return { status: "wrong", message: `${name} has ${plural(frame.nrow, "row")}, but should have ${check.rows.length}. Check your filter.` };

  // Rows as lists in the check's column order
  const gotRows = Array.from({ length: frame.nrow }, (_, r) => check.columns.map((c) => frame.columns[frame.names.indexOf(c)][r]));
  const key = (row: Cell[]) => JSON.stringify(row.map((v) => (typeof v === "number" ? Math.round(v * 100) / 100 : v)));
  const [got, want] = check.ignore_order
    ? [[...gotRows].sort((a, b) => key(a).localeCompare(key(b))), [...check.rows].sort((a, b) => key(a).localeCompare(key(b)))]
    : [gotRows, check.rows];
  for (let r = 0; r < want.length; r++) {
    const c = want[r].findIndex((w, k) => !sameCell(got[r][k], w));
    if (c < 0) continue;
    const col = check.columns[c];
    return {
      status: "wrong",
      message: check.ignore_order
        ? `The rows don't match yet: check the '${col}' column.`
        : `Row ${r + 1} doesn't match yet: its '${col}' is ${show(got[r][c])}. Check the order and the values.`,
    };
  }
  return { status: "pass" };
}

// Printed output: the same lines, ignoring spaces at line ends and blank lines at the start and end
const tidyOutput = (text: string) =>
  text
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((l) => l.trimEnd())
    .join("\n")
    .trim();

function gradeOutputContains(want: string, printed: string): RGrade {
  if (printed.includes(want)) return { status: "pass" };
  if (!printed.trim()) return { status: "wrong", message: "Nothing was printed. Run code that shows the result in the console." };
  return { status: "wrong", message: `The printed output doesn't show ${want} yet. Check what you printed.` };
}

function gradeOutput(want: string, printed: string): RGrade {
  if (tidyOutput(printed) === tidyOutput(want)) return { status: "pass" };
  if (!printed.trim()) return { status: "wrong", message: "Nothing was printed. Print the result (or just run its name on its own line)." };
  return { status: "wrong", message: "The printed output doesn't match yet. Compare it with what the task asks for." };
}

// geom_*() names and what ggplot keeps for them (the geom, and the stat where two share a geom)
const GEOMS: Record<string, { geom: string; stat?: string }> = {
  geom_bar: { geom: "GeomBar", stat: "StatCount" },
  geom_histogram: { geom: "GeomBar", stat: "StatBin" },
  geom_col: { geom: "GeomCol" },
  geom_point: { geom: "GeomPoint" },
  geom_jitter: { geom: "GeomPoint" },
  geom_line: { geom: "GeomLine" },
  geom_boxplot: { geom: "GeomBoxplot" },
  geom_smooth: { geom: "GeomSmooth" },
  geom_area: { geom: "GeomArea" },
  geom_density: { geom: "GeomDensity" },
  geom_text: { geom: "GeomText" },
  geom_label: { geom: "GeomLabel" },
  geom_tile: { geom: "GeomTile" },
  geom_violin: { geom: "GeomViolin" },
  geom_hline: { geom: "GeomHline" },
  geom_vline: { geom: "GeomVline" },
};
// "geom_col" → GeomCol, for geoms not in the list
const camel = (name: string) => name.replace(/(^|_)([a-z])/g, (_, __, c: string) => c.toUpperCase());
const geomOf = (name: string) => GEOMS[name] ?? { geom: camel(name) };
// GeomCol (+ stat) → "geom_col()", for messages
function geomName(layer: { geom: string; stat: string }) {
  const known = Object.entries(GEOMS).find(([, g]) => g.geom === layer.geom && (!g.stat || g.stat === layer.stat));
  return `${known?.[0] ?? layer.geom.replace(/^Geom/, "geom_").replace(/([a-z])([A-Z])/g, "$1_$2").toLowerCase()}()`;
}

const AES_ALIASES: Record<string, string> = { color: "colour", col: "colour" };
const tidyAes = (s: string) => s.replace(/\s+/g, "");

function gradePlot(check: Extract<RCheck, { type: "plot" }>, plot: RPlotInfo): RGrade {
  if (!plot.exists || plot.layers.length === 0) return { status: "wait", note: "Make your chart with ggplot() and a geom_…() layer, then run it." };
  const want = geomOf(check.geom);
  const layer = plot.layers.find((l) => l.geom === want.geom && (!want.stat || l.stat === want.stat));
  if (!layer) return { status: "wrong", message: `This chart needs ${check.geom}(). Yours uses ${plot.layers.map(geomName).join(" and ")}.` };
  // The mapping can be in the plot's main aes() or in the matching layer's own
  for (const [key, value] of Object.entries(check.aes ?? {})) {
    const k = AES_ALIASES[key] ?? key;
    const found = [layer.aes[k], plot.aes[k]].filter((v): v is string => v !== undefined);
    if (found.length === 0) return { status: "wrong", message: `Map ${key} to ${value} inside aes(), like aes(${key} = ${value}).` };
    if (!found.some((got) => tidyAes(got) === tidyAes(value))) return { status: "wrong", message: `${key} is mapped to ${found[0]}, but should be ${value}.` };
  }
  if (check.facets !== undefined) {
    const want = [check.facets].flat();
    const got = plot.facet_vars;
    if (want.length > 0 && plot.facet === "FacetNull") return { status: "wrong", message: `Split the chart into panels with facet_wrap(~ ${want.join(" + ")}).` };
    if (want.length !== got.length || want.some((v) => !got.includes(v)))
      return { status: "wrong", message: `The panels should be split by ${want.join(" and ") || "nothing"}, but yours are split by ${got.join(" and ") || "nothing"}.` };
  }
  if (check.coord_flip !== undefined && (plot.coord === "CoordFlip") !== check.coord_flip)
    return {
      status: "wrong",
      message: check.coord_flip ? "Turn the chart on its side: add + coord_flip()." : "This chart shouldn't be flipped: take out coord_flip().",
    };
  if (check.title !== undefined && (plot.title ?? "") !== check.title)
    return { status: "wrong", message: plot.title ? `The title is "${plot.title}", but should be "${check.title}".` : `Add the title with labs(title = "${check.title}").` };
  return { status: "pass" };
}

// Code without its comments and the text in quotes
const plainCode = (code: string) => code.replace(/"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/g, '""').replace(/#.*$/gm, "");
// A name used as a function, filter(...), or as an argument, na.rm = TRUE
const callOf = (name: string) => new RegExp(`(^|[^\\w.])${name.replace(/\./g, "\\.")}\\s*\\(`);
const argumentOf = (name: string) => new RegExp(`(^|[(,\\s])${name.replace(/\./g, "\\.")}\\s*=(?!=)`);

// The first thing a task wants used that the code doesn't have: a function, an argument, or an
// operator like |> or %>%
function missingUse(mustUse: string[], code: string): string | undefined {
  const plain = plainCode(code);
  return mustUse.find((name) => (/^[\w.]+$/.test(name) ? !callOf(name).test(plain) && !argumentOf(name).test(plain) : !plain.includes(name)));
}

// How to name it in a message: filter(), the na.rm argument, or |>. The task's answer shows which.
function nameForMessage(name: string, answer: string | undefined) {
  if (!/^[\w.]+$/.test(name)) return name;
  const plain = plainCode(answer ?? "");
  return argumentOf(name).test(plain) && !callOf(name).test(plain) ? `the ${name} argument` : `${name}()`;
}

// `answer`: the task's own answer, to tell whether a must_use name is a function or an argument
export type RCheckInputs = { code: string; printed: string; object?: RObjectInfo; plot?: RPlotInfo; answer?: string };

export function gradeR(check: RCheck, { code, printed, object, plot, answer }: RCheckInputs): RGrade {
  const result =
    check.type === "value"
      ? gradeValue(check.name, check.expected, object!)
      : check.type === "data_frame"
        ? gradeFrame(check, object!)
        : check.type === "output"
          ? gradeOutput(check.expected, printed)
          : check.type === "output_contains"
            ? gradeOutputContains(check.expected, printed)
            : gradePlot(check, plot!);
  if (result.status !== "pass") return result;
  const missing = missingUse(check.must_use, code);
  if (missing) return { status: "wrong", message: `Right result! This task wants you to use ${nameForMessage(missing, answer)}, so try it with that.` };
  return result;
}

// ---------- R errors in plain English ----------

const ERRORS: [RegExp, (m: RegExpMatchArray) => string][] = [
  [/could not find function "%>%"/, () => "%>% needs dplyr loaded (library(dplyr)). Or use R's own pipe, |>."],
  [/object '([^']+)' not found/, (m) => `object '${m[1]}' not found. Check the spelling (R cares about capital letters), and that you made it earlier.`],
  [/could not find function "([^"]+)"/, (m) => `there's no function called ${m[1]}(). Check the spelling, or that its package is loaded with library().`],
  [/Column `([^`]+)` doesn't exist/, (m) => `there's no column called ${m[1]}. Check the spelling with names() first.`],
  [/unexpected end of input/, () => "the code stops too early. A bracket, quote or pipe is probably still open."],
  [/unexpected (symbol|numeric constant|string constant)/, () => "R couldn't read that code. A comma or operator is probably missing between two things."],
  [/unexpected '([^']+)'/, (m) => `R didn't expect '${m[1]}' there. Check the brackets and commas around it.`],
  [/unexpected (input|INCOMPLETE_STRING)/, () => "R couldn't read that code. Check the quotes: each \" needs a partner."],
  [/non-numeric argument to (binary operator|mathematical function)/, () => "that's maths on text. Check that the column holds numbers."],
  [/argument "([^"]+)" is missing, with no default/, (m) => `the function needs a value for ${m[1]}, but it's missing.`],
  [/unused argument/, () => "a function got an argument it doesn't know. Check the spelling of the names inside the brackets."],
  [/object of type 'closure' is not subsettable/, () => "that name is a function, not your data (for example df or data). Check which data frame you meant."],
  [/subscript out of bounds/, () => "that position doesn't exist. Check the number inside the brackets."],
  [/`mapping` must be created by `aes\(\)`/, () => "the column mappings need to go inside aes(), like ggplot(df, aes(x = a, y = b))."],
  [/Can't add `.*` to a <ggplot> object|Cannot add .* to a ggplot object/, () => "a ggplot layer was added in the wrong place. Each layer goes after a + at the end of the line before."],
];

export function friendlyRError(message: string): string {
  const first = message.split("\n").find((l) => /\S/.test(l)) ?? message;
  // dplyr and friends explain the real problem after "Caused by error:"
  const cause = message.match(/Caused by error[^:]*:\s*\n?[!x]?\s*(.+)/)?.[1];
  const text = cause ?? message;
  for (const [pattern, explain] of ERRORS) {
    const m = text.match(pattern);
    if (m) return `R error: ${explain(m)}`;
  }
  return `R error: ${first.replace(/^Error( in [^:]*)?:\s*/, "").trim()}`;
}
