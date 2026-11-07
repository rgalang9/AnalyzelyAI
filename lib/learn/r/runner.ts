// The R runner: real R (webR) running inside the browser, in webR's own background worker.
// No server involved. One R is shared by every R lesson page, so R and its packages load once
// per visit (and the browser keeps the downloads, so the next visit is quicker).
// webR itself comes from its CDN when R first starts, so it isn't part of the site's own files.

// Pinned so lessons always run on the same R (webR 0.6.0 is R 4.6.0)
export const WEBR_VERSION = "0.6.0";
const CDN = `https://webr.r-wasm.org/v${WEBR_VERSION}/`;
export const R_PACKAGES = ["dplyr", "tidyr", "ggplot2", "stringr", "lubridate", "readr"];
const PLOT_SIZE = { width: 800, height: 500 };

// The few parts of webR used here (webR's own types would add a 48 MB package to the project)
type RObjectLike = { toJs: () => Promise<{ values: unknown[] }> };
type ShelterLike = {
  captureR: (
    code: string,
    options: Record<string, unknown>
  ) => Promise<{ result: RObjectLike; output: { type: string; data: unknown }[]; images: ImageBitmap[] }>;
  purge: () => Promise<void>;
};
type WebRLike = {
  init: () => Promise<void>;
  close: () => void;
  installPackages: (packages: string[], options?: { quiet?: boolean }) => Promise<void>;
  evalRVoid: (code: string, options?: Record<string, unknown>) => Promise<void>;
  evalRString: (code: string, options?: Record<string, unknown>) => Promise<string>;
  FS: { writeFile: (path: string, data: ArrayBufferView) => Promise<void> };
  Shelter: new () => Promise<ShelterLike>;
};

export type RStatus = { state: "idle" | "loading" | "ready" | "failed"; text: string; pct: number };

// One run: what the console showed (in order), plots drawn, and an R error if there was one
export type RLine = { kind: "out" | "err"; text: string };
export type RRun = { lines: RLine[]; plots: ImageBitmap[]; error: string | null };

let webR: WebRLike | null = null;
let shelter: ShelterLike | null = null;
let starting: Promise<void> | null = null;
let status: RStatus = { state: "idle", text: "", pct: 0 };
const listeners = new Set<(status: RStatus) => void>();
let queue: Promise<unknown> = Promise.resolve(); // one thing at a time in R
let lessonSession = 0; // goes up each time a lesson clears R and loads its own data

function setStatus(next: RStatus) {
  status = next;
  listeners.forEach((listen) => listen(status));
}

export const getRStatus = () => status;
export const getRSession = () => lessonSession;
export function subscribeRStatus(listen: (status: RStatus) => void) {
  listeners.add(listen);
  return () => {
    listeners.delete(listen);
  };
}

// Start R in the background (safe to call many times): download webR, install and load the packages
export function startR(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  starting ??= (async () => {
    try {
      setStatus({ state: "loading", text: "Downloading R…", pct: 5 });
      const mod = (await import(/* webpackIgnore: true */ /* turbopackIgnore: true */ `${CDN}webr.mjs`)) as { WebR: new (options: object) => WebRLike };
      const r = new mod.WebR({ baseUrl: CDN });
      await r.init();
      for (const [i, pkg] of R_PACKAGES.entries()) {
        setStatus({ state: "loading", text: `Installing ${pkg} (${i + 1} of ${R_PACKAGES.length})…`, pct: 15 + Math.round((60 * i) / R_PACKAGES.length) });
        await r.installPackages([pkg], { quiet: true });
      }
      setStatus({ state: "loading", text: "Loading packages…", pct: 80 });
      await r.evalRVoid(`suppressPackageStartupMessages({ ${R_PACKAGES.map((p) => `library(${p})`).join("; ")} })`);
      await r.evalRVoid(HELPERS);
      webR = r;
      shelter = await new r.Shelter();
      setStatus({ state: "ready", text: "R is ready", pct: 100 });
    } catch (err) {
      console.error("R didn't start:", err);
      starting = null;
      setStatus({ state: "failed", text: "We couldn't start R. Check your internet connection and refresh the page.", pct: 0 });
      throw err;
    }
  })();
  return starting;
}

// Run `job` once R is ready, after anything already running
function inR<T>(job: (r: WebRLike, s: ShelterLike) => Promise<T>): Promise<T> {
  const next = queue.then(async () => {
    await startR();
    return job(webR!, shelter!);
  });
  queue = next.catch(() => undefined);
  return next;
}

// Throw R away (e.g. code that never finishes) and start a fresh one. The lesson sets itself up again.
export function restartR(): Promise<void> {
  webR?.close();
  webR = null;
  shelter = null;
  starting = null;
  queue = Promise.resolve();
  return startR();
}

// A fresh session for a lesson: no objects, and the lesson's CSVs loaded as data frames
// (sales.csv → `sales`). The files stay in R's working folder, so read_csv("sales.csv") works too.
// Gives back this session's number: if getRSession() differs later, another lesson has taken R over.
export function setUpLesson(datasets: Record<string, string>): Promise<number> {
  const session = ++lessonSession;
  return inR(async (r) => {
    for (const [name, text] of Object.entries(datasets)) await r.FS.writeFile(`/home/web_user/${name}.csv`, new TextEncoder().encode(text));
    // The names go into the code itself (webR can't pass an empty list); they're only letters, digits and _
    await r.evalRVoid(`.az$reset(c(${Object.keys(datasets).map((n) => JSON.stringify(n)).join(", ")}))`);
    return session;
  });
}

// Run code like RStudio's console: each line's visible result prints, plots are drawn
export function runR(code: string): Promise<RRun> {
  return inR(async (_r, s) => {
    const out = await s.captureR(".az$run(code)", {
      env: { code },
      captureStreams: true,
      captureConditions: false,
      captureGraphics: PLOT_SIZE,
      withAutoprint: false,
    });
    const error = one(JSON.parse(String((await out.result.toJs()).values[0])).error) as string | null;
    await s.purge();
    const lines: RLine[] = out.output
      .filter((o) => o.type === "stdout" || o.type === "stderr")
      .map((o) => ({ kind: o.type === "stdout" ? "out" : "err", text: String(o.data) }));
    return { lines, plots: out.images, error };
  });
}

// What an object holds, for checking: missing, or its class and value (a data frame as columns)
export type RObjectInfo =
  | { exists: false }
  | { exists: true; class: string[]; is_df: boolean; value: unknown };
export function inspectR(name: string): Promise<RObjectInfo> {
  return inR(async (r) => {
    const raw = JSON.parse(await r.evalRString(".az$inspect(name)", { env: { name } }));
    if (!one(raw.exists)) return { exists: false };
    return { exists: true, class: raw.class, is_df: !!one(raw.is_df), value: raw.value };
  });
}

// The last ggplot made or shown: its layers (geom, stat, aes), facets and title
export type RLayer = { geom: string; stat: string; aes: Record<string, string> };
export type RPlotInfo =
  | { exists: false }
  | { exists: true; layers: RLayer[]; aes: Record<string, string>; facet: string; facet_vars: string[]; title: string | null; coord: string };
export function inspectPlot(): Promise<RPlotInfo> {
  return inR(async (r) => {
    const raw = JSON.parse(await r.evalRString(".az$plot_info()"));
    if (!one(raw.exists)) return { exists: false };
    // An empty aes() comes back as [] rather than {}
    const mappings = (aes: unknown): Record<string, string> =>
      Array.isArray(aes) || !aes ? {} : Object.fromEntries(Object.entries(aes as object).map(([k, v]) => [k, String(one(v))]));
    const layers = (raw.layers as { geom: unknown; stat: unknown; aes: unknown }[]).map((l) => ({
      geom: String(one(l.geom)),
      stat: String(one(l.stat)),
      aes: mappings(l.aes),
    }));
    return {
      exists: true,
      layers,
      aes: mappings(raw.aes),
      facet: String(one(raw.facet)),
      facet_vars: raw.facet_vars ?? [],
      title: (one(raw.title) as string | null) ?? null,
      coord: String(one(raw.coord)),
    };
  });
}

// Reset task: remember the session as it is now, and put it back later
export const saveSession = (key: string) => inR((r) => r.evalRVoid(".az$snapshot(key)", { env: { key } }));
export const restoreSession = (key: string) => inR((r) => r.evalRVoid(".az$restore(key)", { env: { key } }));

// R's JSON below writes every value as a list, so a single value comes back as [x]
const one = (v: unknown) => (Array.isArray(v) ? (v[0] ?? null) : v);

// ---------- R helpers, in a hidden environment `.az` (ls() doesn't show names starting with .) ----------

const HELPERS = String.raw`
.az <- new.env()
local(envir = .az, {
  last_plot <- NULL
  snaps <- list()

  # A tiny JSON writer (no extra package needed). Vectors become arrays; a data frame becomes
  # {"names": [...], "columns": [[...], ...], "nrow": n}.
  json <- function(x) {
    esc <- function(s) {
      s <- gsub("\\", "\\\\", s, fixed = TRUE)
      s <- gsub("\"", "\\\"", s, fixed = TRUE)
      s <- gsub("\n", "\\n", s, fixed = TRUE)
      s <- gsub("\r", "\\r", s, fixed = TRUE)
      s <- gsub("\t", "\\t", s, fixed = TRUE)
      s <- gsub("[[:cntrl:]]", " ", s)
      paste0("\"", s, "\"")
    }
    arr <- function(items) paste0("[", paste(items, collapse = ","), "]")
    if (is.null(x)) return("null")
    if (is.data.frame(x)) {
      cols <- vapply(as.list(x), json, "")
      return(paste0("{\"names\":", arr(esc(names(x))), ",\"columns\":", arr(cols), ",\"nrow\":", nrow(x), "}"))
    }
    if (is.list(x)) {
      items <- vapply(x, json, "")
      nms <- names(x)
      if (!is.null(nms) && length(nms) > 0 && all(nms != "")) return(paste0("{", paste0(esc(nms), ":", items, collapse = ","), "}"))
      return(arr(items))
    }
    if (inherits(x, "difftime")) x <- as.numeric(x)
    if (is.factor(x) || inherits(x, c("Date", "POSIXt", "hms"))) x <- as.character(x)
    if (is.logical(x)) return(arr(ifelse(is.na(x), "null", ifelse(x, "true", "false"))))
    if (is.numeric(x)) return(arr(ifelse(is.finite(x), as.character(unclass(x)), "null")))
    x <- as.character(x)
    arr(ifelse(is.na(x), "null", esc(x)))
  }

  reset <- function(names) {
    rm(list = ls(globalenv()), envir = globalenv())
    last_plot <<- NULL
    snaps <<- list()
    # trim_ws = FALSE keeps messy spaces ("Robotics ") for the cleaning lessons
    for (n in names) assign(n, readr::read_csv(paste0(n, ".csv"), trim_ws = FALSE, show_col_types = FALSE, progress = FALSE), envir = globalenv())
  }

  # Like the console: each expression runs in turn, visible results print, the first error stops it
  run <- function(code) {
    exprs <- tryCatch(parse(text = code, keep.source = FALSE), error = function(e) e)
    if (inherits(exprs, "error")) return(json(list(error = conditionMessage(exprs))))
    for (i in seq_along(exprs)) {
      res <- withCallingHandlers(
        tryCatch(withVisible(eval(exprs[[i]], globalenv())), error = function(e) e),
        warning = function(w) {
          message("Warning: ", conditionMessage(w))
          invokeRestart("muffleWarning")
        }
      )
      if (inherits(res, "error")) return(json(list(error = conditionMessage(res))))
      if (inherits(res$value, "ggplot")) last_plot <<- res$value
      if (res$visible) {
        shown <- tryCatch({ print(res$value); NULL }, error = function(e) e)
        if (inherits(shown, "error")) return(json(list(error = conditionMessage(shown))))
      }
    }
    json(list(error = NULL))
  }

  inspect <- function(name) {
    if (!exists(name, envir = globalenv(), inherits = FALSE)) return(json(list(exists = FALSE)))
    obj <- get(name, envir = globalenv())
    is_df <- is.data.frame(obj)
    value <- if (is_df || is.atomic(obj) || is.factor(obj)) obj else NULL
    json(list(exists = TRUE, class = class(obj), is_df = is_df, value = value))
  }

  plot_info <- function() {
    p <- last_plot
    if (is.null(p)) p <- tryCatch(ggplot2::last_plot(), error = function(e) NULL)
    if (is.null(p) || !inherits(p, "ggplot")) return(json(list(exists = FALSE)))
    # The whole expression as text, spaces removed: reorder(genre,total) (as_label can cut long ones short)
    as_text <- function(m) gsub(" ", "", paste(deparse(rlang::quo_squash(m), width.cutoff = 500L), collapse = ""), fixed = TRUE)
    maps <- function(mapping) {
      out <- list()
      for (nm in names(mapping)) out[[nm]] <- as_text(mapping[[nm]])
      out
    }
    base <- maps(p$mapping)
    layers <- lapply(unname(p$layers), function(l) {
      m <- base
      own <- maps(l$mapping)
      for (nm in names(own)) m[[nm]] <- own[[nm]]
      list(geom = class(l$geom)[1], stat = class(l$stat)[1], aes = m)
    })
    vars <- tryCatch({
      prm <- p$facet$params
      c(names(prm$facets), names(prm$rows), names(prm$cols))
    }, error = function(e) character(0))
    title <- tryCatch(p$labels$title, error = function(e) NULL)
    json(list(exists = TRUE, layers = layers, aes = base, facet = class(p$facet)[1], facet_vars = vars,
      title = if (is.null(title)) NULL else as.character(title), coord = class(p$coordinates)[1]))
  }

  snapshot <- function(key) {
    snaps[[key]] <<- list(objects = mget(ls(globalenv()), envir = globalenv()), plot = last_plot)
  }
  restore <- function(key) {
    s <- snaps[[key]]
    if (is.null(s)) return(invisible())
    rm(list = ls(globalenv()), envir = globalenv())
    list2env(s$objects, envir = globalenv())
    last_plot <<- s$plot
  }
})
`;
