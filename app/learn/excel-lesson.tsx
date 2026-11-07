"use client";

import { Fragment, useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { ExcelLesson, LessonSummary } from "@/lib/learn/lesson-types";
import { CELL_RE, cellsIn } from "@/lib/learn/excel/cells";
import { gradeTask } from "@/lib/learn/excel/grade";
import { planAnswer, taskRules, type Step } from "@/lib/learn/excel/answer";
import { keyLabel, keysFor, keysOf, sameKeys, SHORTCUTS, type Keys, type OS, type ShortcutId } from "@/lib/learn/excel/shortcuts";
import LessonSidebar from "./lesson-sidebar";
import { Feedback, HINT_PAUSE_MS, LessonDone, Markdown } from "./lesson-parts";
import { useLearnProgress } from "./progress-context";
import { TaskSteps, useTaskFlow } from "./task-flow";
import Spreadsheet, { type SheetApi } from "./spreadsheet";
import InsightsPanel, { type InsightsTab } from "./insights-panel";
import {
  chartFor,
  missingField,
  NEW_CHART,
  NEW_PIVOT,
  pivotFor,
  taskFields,
  toTable,
  type DataTable,
  type InsightsState,
} from "@/lib/learn/excel/insights";

// An Excel lesson: the task panel on the left, a real spreadsheet on the right.
// One task at a time. Each task is graded (lib/learn/excel/grade.ts) after every committed
// change and every selection change; keys-only tasks by the keys pressed. Only the task's
// cells can be changed.

// ---------- Windows or Mac ----------
// Guessed from the browser, and the learner can switch. Their choice is remembered.

const OS_KEY = "analyzely-excel-os";
const osListeners = new Set<() => void>();
let chosenOs: OS | null = null;

function readOs(): OS {
  if (chosenOs) return chosenOs;
  try {
    const saved = localStorage.getItem(OS_KEY);
    if (saved === "mac" || saved === "windows") return saved;
  } catch {
    // storage blocked: fall back to guessing
  }
  const nav = navigator as Navigator & { userAgentData?: { platform?: string } };
  return /mac|iphone|ipad/i.test(nav.userAgentData?.platform ?? nav.platform) ? "mac" : "windows";
}

function useOs(): [OS, (os: OS) => void] {
  const os = useSyncExternalStore(
    (onChange) => {
      osListeners.add(onChange);
      return () => osListeners.delete(onChange);
    },
    readOs,
    () => "windows" as OS
  );
  const setOs = (next: OS) => {
    chosenOs = next;
    try {
      localStorage.setItem(OS_KEY, next);
    } catch {
      // not saved, but still switched for this visit
    }
    osListeners.forEach((l) => l());
  };
  return [os, setOs];
}

// The help ladder before Show answer: each hint, then highlighting the cells to use
type HelpStep = { kind: "hint"; text: string } | { kind: "highlight" };

// The tester (npm run test:excel) turns this on, to drive lessons from outside
declare global {
  interface Window {
    __excelTestMode?: boolean;
    __excelTest?: Record<string, (...args: never[]) => unknown>;
  }
}

// Shortcuts the browser would otherwise grab while the grid has focus (⌘/Ctrl+A selects the
// page, ⌘/Ctrl+arrows scroll it…). Copy, cut and paste are left alone: the browser's own
// clipboard handling is what makes them work.
const LET_BROWSER_HANDLE = new Set(["copy", "cut", "paste"]);

export default function ExcelLessonPlayer({
  lesson,
  lessons,
  nextLesson,
}: {
  lesson: ExcelLesson;
  lessons: LessonSummary[];
  nextLesson: LessonSummary | null;
}) {
  const flow = useTaskFlow(lesson);
  const { started, setStarted, taskIndex, task, isLastTask, finished, ts, goToTask, finishLesson, solve, say } = flow;
  const { markComplete } = useLearnProgress();
  const [os, setOs] = useOs();
  const sheet = useRef<SheetApi | null>(null);
  const gridRef = useRef<HTMLElement>(null);
  const [ready, setReady] = useState(false); // the spreadsheet has loaded
  const firstSheet = lesson.workbook.sheets[0].name;

  const [help, setHelp] = useState(0); // how many hints (and the highlight) are showing
  const [tries, setTries] = useState(0);
  const [hintComing, setHintComing] = useState(false); // short pause after a wrong answer
  const [helpLocked, setHelpLocked] = useState(false); // short pause after asking for help
  const [showKeys, setShowKeys] = useState(false); // "Show the keys" pressed
  const [answered, setAnswered] = useState(false); // "Show answer" pressed
  const [sheetVersion, setSheetVersion] = useState(0); // goes up when the sheet is reset
  const [pressed, setPressed] = useState<Keys | null>(null); // the live key display
  // The Insights panel (pivot table and chart) beside the grid, and the data block it reads
  const [insightsTab, setInsightsTab] = useState<InsightsTab | null>(null); // null: closed
  const [insights, setInsights] = useState<InsightsState>({ source: null, pivot: NEW_PIVOT, chart: NEW_CHART });
  const [table, setTable] = useState<DataTable | null>(null);
  // Speed rounds: when the lesson started and finished, for the timer
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [finishedAt, setFinishedAt] = useState<number | null>(null);
  // The Goal Seek box (null: closed). result: what Goal Seek said, once it has run.
  const [goalSeek, setGoalSeek] = useState<{ set: string; to: string; changing: string; working: boolean; result: string | null } | null>(null);
  const pressedShortcut = useRef(false); // this task's shortcut was used
  const lastSeen = useRef(""); // what the task looked at during the last check
  const snapshot = useRef<unknown>(null); // the sheet as it was when this task began
  const helpTimer = useRef<number | undefined>(undefined);
  const keyTimer = useRef<number | undefined>(undefined);

  // Help ladder: each hint, then highlighting the cells to use, then Show answer
  const steps: HelpStep[] = [
    ...task.hints.map((text) => ({ kind: "hint" as const, text })),
    ...(task.highlight.length > 0 ? [{ kind: "highlight" as const }] : []),
  ];
  const shown = steps.slice(0, help);
  const highlightOn = started && !ts.solved && shown.some((s) => s.kind === "highlight");

  // Light up the cells to use while that help step is showing
  useEffect(() => {
    if (!highlightOn || !sheet.current) return;
    return sheet.current.highlight(task.sheet, task.highlight);
  }, [highlightOn, task, sheetVersion]);

  useEffect(
    () => () => {
      clearTimeout(helpTimer.current);
      clearTimeout(keyTimer.current);
    },
    []
  );

  // Lock everything except the cells this task uses
  function lockCells(api: SheetApi, t: (typeof lesson.tasks)[number]) {
    const { cells, structure } = taskRules(t);
    const own = t.cell ? cellsIn(t.cell) : [];
    const others = [...cells].filter((c) => !own.includes(c));
    const where = [t.cell, ...others].filter(Boolean).join(" or ");
    const nothing = "In this task, you don't need to change any cells.";
    api.setRules({
      sheet: t.sheet ?? firstSheet,
      cells,
      structure,
      message: cells.size === 0 ? nothing : `In this task, only change ${where}.`,
      editMessage: cells.size === 0 ? nothing : `That's the wrong cell, the task is in ${where}.`,
    });
  }

  // The learner came back and the spreadsheet was rebuilt: put this task's locks and tab back.
  // Bumping sheetVersion brings back the highlight and notes how the sheet looks now.
  function sheetRebuilt(api: SheetApi) {
    if (!started) return;
    lockCells(api, task);
    if (task.sheet) api.showSheet(task.sheet);
    setSheetVersion((v) => v + 1);
  }

  // A task begins: set its locks, remember the sheet for Reset task, show its tab,
  // put the keyboard on the grid, and check once (it may be done already)
  function beginTask(index: number) {
    const api = sheet.current;
    if (!api) return;
    const t = lesson.tasks[index];
    lockCells(api, t);
    snapshot.current = api.snapshot();
    pressedShortcut.current = false;
    lastSeen.current = "";
    if (t.sheet) api.showSheet(t.sheet); // the task's tab, ready to work on
    api.focus();
  }


  function miss(message: string) {
    const n = tries + 1;
    setTries(n);
    say(message);
    setHintComing(true);
    clearTimeout(helpTimer.current);
    helpTimer.current = window.setTimeout(() => {
      setHintComing(false);
      setHelp((h) => Math.min(steps.length, Math.max(h, n)));
    }, HINT_PAUSE_MS);
  }

  function askForHelp() {
    setHelp((h) => Math.min(steps.length, h + 1));
    setHelpLocked(true);
    window.setTimeout(() => setHelpLocked(false), HINT_PAUSE_MS);
  }

  // Grade the task. Runs after each committed change and each selection change.
  // `quiet`: only notice a pass (used when a task begins, before the learner has done anything).
  function grade() {
    const api = sheet.current!;
    const readings = task.cell ? cellsIn(task.cell).map((c) => api.read(task.sheet, c)) : [];
    const rules = task.conditional_format ? api.conditionalFormats(task.sheet) : [];
    const needsLayout = task.hidden_rows || task.hidden_columns || task.frozen || task.validation || task.table;
    const layout = needsLayout ? api.layout(task.sheet) : undefined;
    const panel = task.pivot || task.chart ? { state: insights, table } : undefined;
    const selection = api.selection();
    return {
      readings,
      rules,
      layout,
      panel,
      selection,
      grade: gradeTask({ task, readings, rules, layout, insights: panel, selection, firstSheet, pressed: pressedShortcut.current }),
    };
  }

  // ---- Insights panel ----
  // The data block a panel source covers, read fresh from the sheet
  function readTable(source: InsightsState["source"]): DataTable | null {
    const api = sheet.current;
    if (!api || !source) return null;
    const { values, formats } = api.readBlock(source.sheet, source.range);
    return toTable(values, formats);
  }

  // ---- Goal Seek ----
  function openGoalSeek() {
    const selected = sheet.current?.selection()?.range.split(":")[0] ?? "";
    setGoalSeek({ set: selected, to: "", changing: "", working: false, result: null });
  }

  async function runGoalSeek() {
    const api = sheet.current;
    if (!api || !goalSeek) return;
    const cell = (text: string) => text.replace(/\$/g, "").trim().toUpperCase();
    const [set, changing] = [cell(goalSeek.set), cell(goalSeek.changing)];
    const target = Number(goalSeek.to.replace(/,/g, "").trim());
    const problem = !CELL_RE.test(set)
      ? "Set cell needs one cell, like B7."
      : !CELL_RE.test(changing)
        ? "By changing cell needs one cell, like B3."
        : goalSeek.to.trim() === "" || !Number.isFinite(target)
          ? "To value needs a number, like 0."
          : null;
    if (problem) return setGoalSeek({ ...goalSeek, result: problem });
    setGoalSeek({ ...goalSeek, working: true, result: null });
    const outcome = await api.goalSeek(set, target, changing);
    const shown = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 4 });
    setGoalSeek((g) =>
      g && {
        ...g,
        working: false,
        result: outcome.found
          ? `Goal Seek found a solution. ${set} is now ${shown(target)}, with ${changing} = ${shown(outcome.value)}.`
          : outcome.message,
      }
    );
  }

  // The sheet changed: the panel shows the block's new values
  function refreshTable() {
    if (insights.source) setTable(readTable(insights.source));
  }

  // Pivot table / Chart button, or "Use selected cells": read the block around the selected cell
  function openInsights(tab: InsightsTab | null) {
    if (tab) setInsightsTab(tab);
    const picked = sheet.current?.regionAround() ?? null;
    const pickedTable = readTable(picked);
    // In a pivot or chart task, a block without the task's fields (like the answer cells) doesn't
    // replace data that has them
    const needed = taskFields(task.pivot, task.chart);
    const missing = missingField(pickedTable, needed);
    if (picked && missing && insights.source && !missingField(table, needed)) {
      say(`The cells around your selection don't have a ${missing} column, so the panel keeps reading ${insights.source.range}. Click a cell inside the data to pick it again.`);
      return;
    }
    if (!picked) return;
    setInsights((s) => ({ ...s, source: picked }));
    setTable(pickedTable);
  }

  function check(quiet = false) {
    if (!started || finished || ts.solved || !sheet.current) return;
    const { readings, rules, layout, panel, selection, grade: result } = grade();
    const seen = JSON.stringify([readings, rules, layout, panel, task.selected ? selection : null, pressedShortcut.current]);
    if (!quiet && seen === lastSeen.current) return; // nothing new for this task
    lastSeen.current = seen;
    if (result.status === "pass") return solve(task.cell || !task.selected ? "Nice work! That's right. 🎉" : "Nice work! That's the right selection. 🎉");
    if (quiet) return;
    if (result.status === "wrong") return miss(result.message);
    if (result.note) say(result.note);
  }

  // Put the answer into the sheet and mark the task done, so later tasks still work
  async function showAnswer() {
    const api = sheet.current;
    if (!api || ts.solved) return;
    setAnswered(true);
    const plan = planAnswer(task);
    if (plan) await api.run(task.sheet, plan);
    else if (task.cell && task.expected !== undefined) {
      // An answer that isn't steps: fill in the expected values
      const values = [task.expected].flat();
      await api.run(
        task.sheet,
        cellsIn(task.cell).flatMap((cell, i) => (values[i] === null ? [] : [{ kind: "set" as const, cell, value: String(values[i]) }]))
      );
    }
    if (task.selected) api.select(task.sheet, task.selected);
    if (task.pivot || task.chart) {
      // Set the panel as the task wants it, on data that has the task's fields: the panel's own,
      // the block around the selection, or the block around A1
      const needed = taskFields(task.pivot, task.chart);
      const candidates = [insights.source, api.regionAround(task.sheet), api.regionAround(task.sheet ?? firstSheet, "A1")];
      const source = candidates.find((c) => c && !missingField(readTable(c), needed)) ?? candidates.find(Boolean) ?? null;
      setInsights((s) => ({
        source,
        pivot: task.pivot ? pivotFor(task.pivot, s.pivot) : s.pivot,
        chart: task.chart ? chartFor(task.chart, s.chart) : s.chart,
      }));
      setTable(readTable(source));
      setInsightsTab(task.pivot ? "pivot" : "chart");
    }
    solve(task.answer ? `Here's the answer, filled in for you: ${task.answer}` : "Here's the answer, done for you.");
    api.focus();
  }

  // Back to how the sheet was when this task began
  function resetTask() {
    const api = sheet.current;
    if (!api || snapshot.current === null) return;
    api.restore(snapshot.current);
    if (task.sheet) api.showSheet(task.sheet);
    goToTask(taskIndex); // clears the feedback (hints already shown stay)
    setSheetVersion((v) => v + 1);
    pressedShortcut.current = false;
    lastSeen.current = "";
    api.focus();
  }

  function onKey(e: KeyboardEvent) {
    const keys = keysOf(e, os);
    if (!keys) return;
    setPressed(keys);
    clearTimeout(keyTimer.current);
    keyTimer.current = window.setTimeout(() => setPressed(null), 2500);

    const inGrid = !!gridRef.current?.contains(document.activeElement);
    const lessonShortcut = (Object.keys(SHORTCUTS) as ShortcutId[]).find((id) => {
      const press = keysFor(id, os).press;
      return press && sameKeys(keys, press);
    });
    if (inGrid && lessonShortcut && !LET_BROWSER_HANDLE.has(lessonShortcut) && keys.length > 1) e.preventDefault();

    if (!started || finished || ts.solved || !task.shortcut) return;
    if (lessonShortcut === task.shortcut) {
      pressedShortcut.current = true;
      if (!task.cell && !task.selected) solve(`Nice! That's ${SHORTCUTS[task.shortcut].action.toLowerCase()}. 🎉`);
      return;
    }
    const other = keysFor(task.shortcut, os === "mac" ? "windows" : "mac").press;
    if (other && sameKeys(keys, other))
      say(`Those are the ${os === "mac" ? "Windows" : "Mac"} keys. If you're on ${os === "mac" ? "Windows" : "a Mac"}, switch it at the top.`);
  }

  function next() {
    if (isLastTask) {
      setFinishedAt(Date.now()); // a speed round's clock stops here
      return finishLesson();
    }
    clearTimeout(helpTimer.current);
    setHelp(0);
    setTries(0);
    setHintComing(false);
    setShowKeys(false);
    setAnswered(false);
    goToTask(taskIndex + 1);
    beginTask(taskIndex + 1);
  }

  function start() {
    setStarted(true);
    setStartedAt(Date.now());
    beginTask(0);
  }

  // Event listeners, timers and the tester call the latest version of these
  const latest = useRef({ check, onKey, start, next, showAnswer, resetTask, grade, openInsights, refreshTable, openGoalSeek, sheetRebuilt });
  useEffect(() => {
    latest.current = { check, onKey, start, next, showAnswer, resetTask, grade, openInsights, refreshTable, openGoalSeek, sheetRebuilt };
  });

  // Keyboard-only tasks: clicks on the grid are blocked until the task is done
  useEffect(() => {
    sheet.current?.setKeyboardOnly(started && !finished && !ts.solved && task.keyboard_only);
  }, [started, finished, ts.solved, task, ready]);

  // The panel's settings or data changed: the task may be done
  useEffect(() => {
    latest.current.check();
  }, [insights, table]);

  // Once a task is on screen (and again when formulas have settled), note how the sheet looks,
  // so only the learner's own changes get feedback. It may already be done.
  useEffect(() => {
    if (!started || finished) return;
    const timers = [0, 800].map((ms) => window.setTimeout(() => latest.current.check(true), ms));
    return () => timers.forEach(clearTimeout);
  }, [started, finished, taskIndex, sheetVersion]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => latest.current.onKey(e);
    window.addEventListener("keydown", handler, true);
    return () => window.removeEventListener("keydown", handler, true);
  }, []);

  // The tester's handle on this lesson (only when the tester switched it on)
  const info = { id: lesson.id, taskIndex, taskCount: lesson.tasks.length, started, finished, solved: ts.solved, feedback: ts.feedback?.text ?? null, ready, os };
  const infoRef = useRef(info);
  useEffect(() => {
    infoRef.current = info;
  });
  useEffect(() => {
    if (!window.__excelTestMode) return;
    const s = () => sheet.current!;
    window.__excelTest = {
      info: () => infoRef.current,
      start: () => latest.current.start(),
      next: () => latest.current.next(),
      showAnswer: () => latest.current.showAnswer(),
      reset: () => latest.current.resetTask(),
      grade: () => latest.current.grade().grade,
      read: (cell: string) => s().read(undefined, cell),
      selection: () => s().selection(),
      select: (range: string) => s().select(undefined, range),
      focus: () => s().focus(),
      // As if the learner did it: the locks apply
      act: (steps: Step[]) => s().run(undefined, steps, true),
      plan: (index: number) => planAnswer(lesson.tasks[index]),
      rules: (index: number) => {
        const r = taskRules(lesson.tasks[index]);
        return { cells: [...r.cells], structure: r.structure };
      },
      task: (index: number) => lesson.tasks[index],
      cells: (range: string) => cellsIn(range),
      keys: (id: ShortcutId) => keysFor(id, readOs()).press,
      finishNow: () => markComplete(lesson.id),
    } as unknown as Window["__excelTest"];
    return () => {
      window.__excelTest = undefined;
    };
  }, [lesson, markComplete]);

  const shortcut = task.shortcut ? { ...keysFor(task.shortcut, os), action: SHORTCUTS[task.shortcut].action } : null;
  const keysVisible = task.shortcut_help === "badge" || showKeys || answered;

  return (
    <div className="mt-4 grid gap-4 lg:grid-cols-[14rem_minmax(0,1fr)]">
      <div className="self-start">
        <LessonSidebar language="excel" lessons={lessons} currentId={lesson.id} />
      </div>

      <div className="grid min-w-0 gap-4 xl:grid-cols-[22rem_minmax(0,1fr)]">
        {/* ---------- Task panel ---------- */}
        <section className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <TaskSteps count={lesson.tasks.length} current={started ? taskIndex : -1} solved={ts.solved} finished={finished} />
            {lesson.speed_round && startedAt !== null && <SpeedTimer since={startedAt} until={finishedAt} />}
            <OsSwitch os={os} onChange={setOs} />
          </div>

          {!started ? (
            <>
              <p className="whitespace-pre-line leading-7">{lesson.explanation}</p>
              <button
                type="button"
                onClick={start}
                disabled={!ready}
                className="self-start rounded-full bg-foreground px-6 py-3 font-medium text-background transition-opacity hover:opacity-80 disabled:cursor-wait disabled:opacity-40"
              >
                Got it
              </button>
            </>
          ) : finished ? (
            <>
              {lesson.speed_round && startedAt !== null && finishedAt !== null && (
                <p className="rounded-xl border border-purple/30 bg-purple/5 px-4 py-3 font-semibold">
                  ⏱ Your time: {clock(finishedAt - startedAt)}
                </p>
              )}
              <LessonDone recap={lesson.recap} language="excel" nextLesson={nextLesson} />
            </>
          ) : (
            <>
              <details className="rounded-xl border border-zinc-200 px-4 py-2 text-sm">
                <summary className="cursor-pointer font-medium">Explanation</summary>
                <p className="mt-2 whitespace-pre-line leading-6">{lesson.explanation}</p>
              </details>

              <div className={`rounded-2xl border p-4 ${ts.solved ? "border-green-300 bg-green-50" : "border-zinc-200"}`}>
                <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                  Task {taskIndex + 1} of {lesson.tasks.length}
                </p>
                {task.teach && (
                  // A new idea introduced mid-lesson; single line breaks are kept
                  <div className="mt-2 mb-3 rounded-xl bg-purple-light/40 px-4 py-3 text-sm leading-6 [&_p]:whitespace-pre-line">
                    <Markdown text={task.teach} />
                  </div>
                )}
                <p className="mt-1 font-medium leading-7">{task.prompt}</p>

                {shortcut && (
                  <div className="mt-3 flex flex-col gap-2 text-sm">
                    <p className="font-medium">⌨️ {shortcut.action}</p>
                    {keysVisible && shortcut.press ? (
                      <KeyBadges keys={shortcut.press} os={os} big />
                    ) : (
                      task.shortcut_help === "hint" && (
                        <button
                          type="button"
                          onClick={() => setShowKeys(true)}
                          className="self-start rounded-full border border-zinc-300 px-4 py-1.5 text-sm font-medium hover:bg-zinc-100"
                        >
                          Show the keys
                        </button>
                      )
                    )}
                    {keysVisible && shortcut.browser && (
                      <p className="text-xs text-zinc-600">
                        In real Excel this is <KeyBadges keys={shortcut.excel} os={os} />, but your browser {shortcut.browser} with
                        those keys
                        {shortcut.press ? ", so here press the keys above instead." : ", so here do it another way."}
                      </p>
                    )}
                  </div>
                )}
              </div>

              {ts.feedback && <Feedback tone={ts.feedback.tone}>{ts.feedback.text}</Feedback>}
              {hintComing && <p className="animate-pulse text-sm text-zinc-500">Have a think… a hint is on its way.</p>}

              {!ts.solved && shown.length > 0 && (
                <ul className="flex flex-col gap-2">
                  {shown.map((step, i) => (
                    <li key={i} className="rounded-xl bg-blue-50 px-4 py-3 text-sm text-blue-950">
                      {step.kind === "hint" ? (
                        <>
                          <span className="font-semibold">💡 Hint {i + 1}: </span>
                          {step.text}
                        </>
                      ) : (
                        <>👀 The cells you need are highlighted in the sheet.</>
                      )}
                    </li>
                  ))}
                </ul>
              )}

              {ts.solved ? (
                <button
                  type="button"
                  onClick={next}
                  className="self-start rounded-full bg-foreground px-6 py-3 font-medium text-background transition-opacity hover:opacity-80"
                >
                  {isLastTask ? "Finish lesson" : "Next task →"}
                </button>
              ) : (
                <div className="flex flex-wrap items-center gap-4">
                  {help < steps.length ? (
                    <button
                      type="button"
                      onClick={askForHelp}
                      disabled={helpLocked || hintComing}
                      className="text-sm font-medium text-zinc-600 underline underline-offset-4 hover:text-foreground disabled:cursor-wait disabled:opacity-50"
                    >
                      Need help?
                    </button>
                  ) : (
                    // The last step of the help ladder
                    <button
                      type="button"
                      onClick={showAnswer}
                      disabled={helpLocked || hintComing}
                      className="text-sm font-medium text-zinc-600 underline underline-offset-4 hover:text-foreground disabled:cursor-wait disabled:opacity-50"
                    >
                      Show answer
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={resetTask}
                    title="Put the sheet back to how it was when this task began"
                    className="text-sm font-medium text-zinc-600 underline underline-offset-4 hover:text-foreground"
                  >
                    ↺ Reset task
                  </button>
                </div>
              )}
            </>
          )}
        </section>

        {/* ---------- Spreadsheet ---------- */}
        <section ref={gridRef} className="relative flex h-[70vh] min-h-[30rem] min-w-0 overflow-hidden rounded-2xl border border-zinc-200">
          <div className="relative h-full min-w-0 flex-1">
            <Spreadsheet
              id={lesson.id}
              sheets={lesson.workbook.sheets}
              onReady={(api) => {
                sheet.current = api;
                setReady(true);
                latest.current.sheetRebuilt(api);
              }}
              onClosed={() => {
                sheet.current = null;
                setReady(false);
              }}
              onValues={() => {
                latest.current.refreshTable();
                latest.current.check();
              }}
              onSelection={() => latest.current.check()}
              onBlocked={say}
              onInsights={(tab) => latest.current.openInsights(tab)}
              onGoalSeek={() => latest.current.openGoalSeek()}
            />
            {goalSeek && (
              <form
                aria-label="Goal Seek"
                onSubmit={(e) => {
                  e.preventDefault();
                  void runGoalSeek();
                }}
                className="absolute right-4 top-24 z-20 w-72 rounded-xl border border-zinc-300 bg-white p-4 text-sm shadow-lg"
              >
                <p className="mb-3 font-semibold">Goal Seek</p>
                {(
                  [
                    ["set", "Set cell", "B7"],
                    ["to", "To value", "0"],
                    ["changing", "By changing cell", "B3"],
                  ] as const
                ).map(([key, label, example]) => (
                  <label key={key} className="mb-2 flex items-center justify-between gap-2">
                    <span className="text-zinc-700">{label}</span>
                    <input
                      type="text"
                      value={goalSeek[key]}
                      placeholder={example}
                      disabled={goalSeek.working}
                      onChange={(e) => setGoalSeek({ ...goalSeek, [key]: e.target.value, result: null })}
                      className="w-24 rounded-md border border-zinc-300 px-2 py-1 font-mono"
                    />
                  </label>
                ))}
                {goalSeek.working && <p className="mt-2 text-zinc-500">Trying values…</p>}
                {goalSeek.result && <p className="mt-2 text-zinc-800">{goalSeek.result}</p>}
                <div className="mt-3 flex justify-end gap-2">
                  <button
                    type="button"
                    disabled={goalSeek.working}
                    onClick={() => setGoalSeek(null)}
                    className="rounded-full px-3 py-1 text-zinc-600 hover:bg-zinc-100"
                  >
                    {goalSeek.result?.startsWith("Goal Seek found") ? "Close" : "Cancel"}
                  </button>
                  {!goalSeek.result?.startsWith("Goal Seek found") && (
                    <button type="submit" disabled={goalSeek.working} className="rounded-full bg-purple px-4 py-1 font-medium text-white disabled:opacity-50">
                      OK
                    </button>
                  )}
                </div>
              </form>
            )}
            {!ready && (
              <p className="absolute inset-0 flex items-center justify-center bg-white text-sm text-zinc-500">Loading the spreadsheet…</p>
            )}
            {ready && !started && (
              // Anti-rush: the sheet opens once the explanation is read
              <div className="absolute inset-0 flex items-center justify-center bg-white/70">
                <p className="rounded-full bg-white px-5 py-2.5 text-sm font-medium shadow">Read the explanation, then press Got it</p>
              </div>
            )}
            <div
              aria-live="polite"
              className="pointer-events-none absolute bottom-12 right-4 rounded-xl border border-zinc-200 bg-white/95 px-3 py-2 text-xs shadow"
            >
              {pressed ? <KeyBadges keys={pressed} os={os} /> : <span className="text-zinc-400">Keys you press show here</span>}
            </div>
          </div>
          {insightsTab && (
            <InsightsPanel
              tab={insightsTab}
              state={insights}
              table={table}
              onTab={setInsightsTab}
              onChange={setInsights}
              onUseSelection={() => openInsights(null)}
              onClose={() => setInsightsTab(null)}
            />
          )}
        </section>
      </div>
    </div>
  );
}


// 83 seconds as "1:23"
const clock = (ms: number) => {
  const seconds = Math.floor(ms / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
};

// A speed round's running time, ticking every second until it stops
function SpeedTimer({ since, until }: { since: number; until: number | null }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (until !== null) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [until]);
  return (
    <span aria-label="Time" className="rounded-full bg-zinc-100 px-3 py-1 font-mono text-sm tabular-nums">
      ⏱ {clock((until ?? now) - since)}
    </span>
  );
}

// Keys as little keyboard keys: ⌘ + Shift + ↓
function KeyBadges({ keys, os, big = false }: { keys: Keys; os: OS; big?: boolean }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-1 align-middle">
      {keys.map((key, i) => (
        <Fragment key={i}>
          {i > 0 && <span className="text-zinc-400">+</span>}
          <kbd
            className={`rounded-md border border-b-2 border-zinc-300 bg-white font-mono font-semibold text-navy ${
              big ? "px-3 py-1.5 text-lg" : "px-1.5 py-0.5 text-xs"
            }`}
          >
            {keyLabel(key, os)}
          </kbd>
        </Fragment>
      ))}
    </span>
  );
}

function OsSwitch({ os, onChange }: { os: OS; onChange: (os: OS) => void }) {
  return (
    <div role="group" aria-label="Your computer" className="flex rounded-full border border-zinc-300 p-0.5 text-xs font-medium">
      {(["windows", "mac"] as const).map((option) => (
        <button
          key={option}
          type="button"
          aria-pressed={os === option}
          onClick={() => onChange(option)}
          className={`rounded-full px-3 py-1 ${os === option ? "bg-purple text-white" : "text-zinc-600 hover:bg-zinc-100"}`}
        >
          {option === "mac" ? "Mac" : "Windows"}
        </button>
      ))}
    </div>
  );
}
