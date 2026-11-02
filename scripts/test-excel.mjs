// npm run test:excel: plays every task of every Excel lesson in a real (headless) Chrome.
//
// For each task it checks: the answer passes; a wrong number fails; a typed-in number fails when
// a formula is needed; locked cells can't be changed; selection tasks pass only with the right
// selection; shortcut tasks pass with the right keys; and Show answer fills in the sheet so the
// next task still passes. Empty lesson files are skipped.
//
// It builds the site first (lessons are read at build time). Add --no-build to skip that.

import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const LESSONS = path.join(ROOT, "lib/learn/excel/lessons");
const CHROME = [
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
].find(existsSync);

const problems = []; // { where, what }
let checks = 0;
// The same problem found in both passes is listed once
const fail = (where, what) => {
  if (!problems.some((p) => p.where === where && p.what === what)) problems.push({ where, what });
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- 1. The lesson files themselves ----------

const lessonNumber = (f) => Number(f.match(/\d+/)?.[0] ?? Infinity);
const lessons = [];
for (const file of readdirSync(LESSONS).filter((f) => f.endsWith(".json")).sort((a, b) => lessonNumber(a) - lessonNumber(b))) {
  const text = readFileSync(path.join(LESSONS, file), "utf8");
  if (!text.trim()) continue; // not written yet
  let lesson;
  try {
    lesson = JSON.parse(text);
  } catch (err) {
    fail(file, `isn't valid JSON: ${err.message}`);
    continue;
  }
  checks++;
  for (const field of ["id", "level", "title", "explanation", "workbook", "tasks", "recap"])
    if (lesson[field] === undefined) fail(file, `is missing "${field}"`);
  if (!Array.isArray(lesson.workbook?.sheets) || lesson.workbook.sheets.length === 0) fail(file, "has no sheets in workbook");
  (lesson.tasks ?? []).forEach((t, i) => {
    if (!t.prompt) fail(`${file} task ${i + 1}`, 'is missing "prompt"');
    if (t.cell && t.expected === undefined && !t.number_format) fail(`${file} task ${i + 1}`, 'has a cell but no "expected"');
    if (t.cell && !t.answer) fail(`${file} task ${i + 1}`, 'has a cell but no "answer"');
  });
  lessons.push({ file, ...lesson });
}
if (lessons.length === 0) {
  console.log("No Excel lessons to test.");
  process.exit(0);
}

// ---------- 2. Build and start the site ----------

function run(cmd, args, opts = {}) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { cwd: ROOT, env: process.env, ...opts });
    let out = "";
    child.stdout?.on("data", (d) => (out += d));
    child.stderr?.on("data", (d) => (out += d));
    child.on("close", (code) => resolve({ code, out }));
  });
}

const freePort = () =>
  new Promise((resolve) => {
    const s = createServer();
    s.listen(0, () => {
      const { port } = s.address();
      s.close(() => resolve(port));
    });
  });

if (!process.argv.includes("--no-build")) {
  console.log("Building the site (lessons are read at build time)…");
  const build = await run("npx", ["next", "build"]);
  if (build.code !== 0) {
    console.log(build.out.split("\n").slice(-40).join("\n"));
    console.log("\n✗ The build failed, so the lessons couldn't be tested. The error above names the lesson file.");
    process.exit(1);
  }
}
if (!CHROME) {
  console.log("✗ Couldn't find Google Chrome, which the tester needs.");
  process.exit(1);
}

const sitePort = await freePort();
const server = spawn("npx", ["next", "start", "-p", String(sitePort)], { cwd: ROOT, env: process.env, stdio: "ignore" });
const SITE = `http://localhost:${sitePort}`;
for (let i = 0; i < 60; i++) {
  if (await fetch(SITE).then(() => true, () => false)) break;
  await sleep(500);
}

const chromePort = await freePort();
const profile = mkdtempSync(path.join(tmpdir(), "excel-test-"));
const chrome = spawn(
  CHROME,
  ["--headless=new", `--remote-debugging-port=${chromePort}`, `--user-data-dir=${profile}`, "--no-first-run", "--window-size=1440,1000", "about:blank"],
  { stdio: "ignore" }
);
let pageWs;
for (let i = 0; i < 60 && !pageWs; i++) {
  await sleep(250);
  const list = await fetch(`http://127.0.0.1:${chromePort}/json/list`).then((r) => r.json(), () => []);
  pageWs = list.find((t) => t.type === "page")?.webSocketDebuggerUrl;
}

async function stopAll(code) {
  chrome.kill();
  server.kill();
  await sleep(500);
  try {
    rmSync(profile, { recursive: true, force: true });
  } catch {
    // Chrome may still be writing its profile; it's in the temp folder anyway
  }
  process.exit(code);
}
if (!pageWs) {
  console.log("✗ Couldn't start headless Chrome.");
  await stopAll(1);
}

// ---------- Talking to the page ----------

const ws = new WebSocket(pageWs);
await new Promise((r) => (ws.onopen = r));
let nextId = 0;
const waiting = new Map();
ws.onmessage = (m) => {
  const d = JSON.parse(m.data);
  if (waiting.has(d.id)) {
    waiting.get(d.id)(d);
    waiting.delete(d.id);
  }
};
const send = (method, params = {}) =>
  new Promise((r) => {
    const id = ++nextId;
    waiting.set(id, r);
    ws.send(JSON.stringify({ id, method, params }));
  });
// Runs code in the page; returns its value, or { error } if it threw or took over 10 seconds
async function page(expr) {
  const res = await Promise.race([
    send("Runtime.evaluate", { expression: `(async () => (${expr}))()`, awaitPromise: true, returnByValue: true }),
    sleep(10000).then(() => ({ result: { exceptionDetails: { exception: { description: `timed out: ${expr.slice(0, 80)}` } } } })),
  ]);
  if (res.result?.exceptionDetails) return { error: res.result.exceptionDetails.exception?.description ?? "error" };
  return res.result?.result?.value;
}
async function until(expr, ms = 6000) {
  const t = Date.now();
  while (Date.now() - t < ms) {
    if (await page(expr)) return true;
    await sleep(100);
  }
  return false;
}
const T = (call) => page(`window.__excelTest.${call}`);

// Real key presses, as if typed on the keyboard
const KEY = {
  Down: ["ArrowDown", "ArrowDown", 40], Up: ["ArrowUp", "ArrowUp", 38], Left: ["ArrowLeft", "ArrowLeft", 37], Right: ["ArrowRight", "ArrowRight", 39],
  Enter: ["Enter", "Enter", 13], Tab: ["Tab", "Tab", 9], Esc: ["Escape", "Escape", 27], Space: [" ", "Space", 32],
  "=": ["=", "Equal", 187], ";": [";", "Semicolon", 186], Delete: ["Delete", "Delete", 46], Backspace: ["Backspace", "Backspace", 8],
};
async function press(keys) {
  const mods = { Alt: 1, Option: 1, Ctrl: 2, Cmd: 4, Shift: 8 };
  const modifiers = keys.reduce((m, k) => m | (mods[k] ?? 0), 0);
  const main = keys.find((k) => !(k in mods));
  let [key, code, vk] = KEY[main] ?? [];
  if (/^[A-Z]$/.test(main)) [key, code, vk] = [main.toLowerCase(), `Key${main}`, main.charCodeAt(0)];
  else if (/^\d$/.test(main)) [key, code, vk] = [main, `Digit${main}`, main.charCodeAt(0)];
  else if (/^F\d+$/.test(main)) [key, code, vk] = [main, main, 111 + Number(main.slice(1))];
  await T("focus()");
  await send("Input.dispatchKeyEvent", { type: "rawKeyDown", modifiers, key, code, windowsVirtualKeyCode: vk });
  await send("Input.dispatchKeyEvent", { type: "keyUp", modifiers, key, code, windowsVirtualKeyCode: vk });
  await sleep(350);
}

// The keys for a shortcut on this computer (read from the page, the same map the lessons use)
const keysFor = (id) => T(`keys(${JSON.stringify(id)})`);

// ---------- 3. Play every lesson ----------

const where = (lesson, i) => `${lesson.file} task ${i + 1}`;
const expectedList = (t) => (Array.isArray(t.expected) ? t.expected : [t.expected]);
const cellsOf = (range) => T(`cells(${JSON.stringify(range)})`);

// Do a task's answer the way a learner would (real keys for undo and required shortcuts)
async function doAnswer(lesson, i, task) {
  const plan = await T(`plan(${i})`);
  if (!plan) return false;
  if (task.shortcut && task.shortcut_required && !plan.some((s) => s.kind === "undo")) await press(await keysFor(task.shortcut));
  for (const step of plan) {
    if (step.kind === "undo") await press((await page("window.__excelTest.info().os")) === "mac" ? ["Cmd", "Z"] : ["Ctrl", "Z"]);
    else {
      const res = await T(`act(${JSON.stringify([step])})`);
      if (res?.error) fail(where(lesson, i), `the answer step ${JSON.stringify(step)} was blocked: ${res.error.split("\n")[0]}`);
      await sleep(150);
    }
  }
  return true;
}

// A cell outside what the task may change, to try editing
async function lockedCell(i) {
  const { cells } = await T(`rules(${i})`);
  for (const col of "ABCDEFGH") for (let row = 1; row <= 12; row++) if (!cells.includes(`${col}${row}`)) return `${col}${row}`;
  return "Z99";
}

async function playTask(lesson, i, { useShowAnswer, testStructure }) {
  const task = lesson.tasks[i];
  const here = where(lesson, i);
  if (process.argv.includes("--verbose")) console.log(`    ${here}`);
  if (!(await until(`window.__excelTest?.info().taskIndex === ${i}`))) return fail(here, "never started");
  await sleep(1000); // the lesson takes its first look at the sheet
  if (await page("window.__excelTest.info().solved")) {
    checks++;
    return fail(here, "is already done the moment it begins, so the learner has nothing to do (lesson problem)");
  }
  const solved = () => until("window.__excelTest.info().solved", 6000);
  const notSolved = async () => {
    await sleep(700);
    return !(await page("window.__excelTest.info().solved"));
  };
  const feedback = () => page("window.__excelTest.info().feedback");

  if (!useShowAnswer) {
    // Locked cells stay as they were
    const cell = await lockedCell(i);
    const before = await T(`read("${cell}")`);
    await T(`act([{ kind: "set", cell: "${cell}", value: "LOCKTEST" }])`);
    await sleep(500);
    const after = await T(`read("${cell}")`);
    checks++;
    if (JSON.stringify(after) !== JSON.stringify(before)) fail(here, `editing locked cell ${cell} wasn't blocked (it now shows ${after?.value})`);
    else if (!/only change|don't need to change/.test((await feedback()) ?? ""))
      fail(here, `editing locked cell ${cell} was undone, but the message was "${await feedback()}" instead of saying why`);
    if (await page("window.__excelTest.info().solved")) fail(here, `editing locked cell ${cell} passed the task`);

    // Rows can't be inserted, except in tasks that teach it
    if (testStructure && !(await T(`rules(${i})`)).structure) {
      const a1 = await T('read("A1")');
      await T('act([{ kind: "insert-row", row: 1 }])');
      await sleep(400);
      checks++;
      if (JSON.stringify(await T('read("A1")')) !== JSON.stringify(a1)) fail(here, "inserting a row wasn't blocked");
    }
  }

  if (task.cell && task.expected !== undefined && !useShowAnswer) {
    const cells = await cellsOf(task.cell);
    const expected = expectedList(task);
    const firstBefore = await T(`read("${cells[0]}")`);
    const needKeys = task.shortcut && task.shortcut_required;

    // A wrong number (or wrong text) fails
    const e0 = expected[0];
    if (e0 !== null) {
      const wrong = typeof e0 === "number" ? String(e0 + 7) : "zzz wrong";
      await T(`act([{ kind: "set", cell: "${cells[0]}", value: ${JSON.stringify(wrong)} }])`);
      checks++;
      if (!(await notSolved())) fail(here, `a wrong answer (${wrong} in ${cells[0]}) passed`);
      else if (!needKeys && cells.length === 1 && (await feedback()) !== "Not quite, try a hint.")
        fail(here, `a wrong answer gave the message "${await feedback()}" instead of "Not quite, try a hint."`);
      await T("reset()");
      await sleep(500);
    }

    // A typed-in number fails when the task needs a formula
    if ((task.must_be_formula || task.function || task.formula_contains?.length) && expected.every((v) => v !== null)) {
      await T(`act(${JSON.stringify(cells.map((cell, n) => ({ kind: "set", cell, value: String(expected[n]) })))})`);
      checks++;
      if (!(await notSolved())) fail(here, "typing the number instead of a formula passed");
      else if (!needKeys && !/formula starting with =/.test((await feedback()) ?? "")) fail(here, `a typed number gave the message "${await feedback()}"`);
      await T("reset()");
      await sleep(500);
    }

    checks++;
    if (JSON.stringify(await T(`read("${cells[0]}")`)) !== JSON.stringify(firstBefore)) fail(here, "Reset task didn't put the sheet back");
  }

  if (task.selected && !task.cell && !useShowAnswer) {
    const start = task.prompt.match(/\b(?:click|from)\s+([A-Z]{1,3}[1-9]\d*)\b/i)?.[1];
    const startAt = start ?? (await T("selection()"))?.range;
    // A wrong selection doesn't pass
    const wrong = task.selected === "H20" ? "H21" : "H20";
    await T(`select("${wrong}")`);
    checks++;
    if (!(await notSolved())) fail(here, `the wrong selection ${wrong} passed`);
    if (task.shortcut && task.shortcut_required) {
      await T(`select("${task.selected}")`);
      checks++;
      if (!(await notSolved())) fail(here, "selecting without the keys passed, but this task needs the keys");
      await T(`select("${startAt}")`);
      await sleep(200);
      await press(await keysFor(task.shortcut));
      checks++;
      if (!(await solved())) {
        fail(here, `pressing ${(await keysFor(task.shortcut)).join("+")} from ${startAt} didn't select ${task.selected} (selection is ${(await T("selection()"))?.range})`);
      }
    } else {
      await T(`select("${task.selected}")`);
      checks++;
      if (!(await solved())) fail(here, `selecting ${task.selected} didn't pass`);
    }
  } else if (!task.cell && task.shortcut && !useShowAnswer) {
    // A keys-only task
    await press(await keysFor(task.shortcut));
    checks++;
    if (!(await solved())) fail(here, `pressing ${(await keysFor(task.shortcut)).join("+")} didn't pass`);
  } else if (task.cell && !useShowAnswer) {
    // The task's own answer passes
    checks++;
    if (!(await doAnswer(lesson, i, task))) fail(here, `its answer "${task.answer}" can't be read as steps, so Show answer can only fill in values`);
    else if (!(await solved())) {
      const g = await T("grade()");
      const got = await Promise.all((await cellsOf(task.cell)).map((c) => T(`read("${c}")`)));
      fail(here, `its answer "${task.answer}" didn't pass (${g.message ?? g.note ?? g.status}; the cells show ${got.map((r) => JSON.stringify(r.value)).join(", ")})`);
    }
  }

  if (useShowAnswer) {
    await T("showAnswer()");
    checks++;
    if (!(await solved())) fail(here, "Show answer didn't mark the task done");
    else if (task.cell || task.selected) {
      await sleep(500); // let formulas recalculate
      const g = await T("grade()");
      // (a keys-only task can't be passed by Show answer's own selection: that part is fine)
      const onlyKeys = task.shortcut_required && g.status === "wait" && /use the keys/.test(g.note ?? "");
      if (g.status !== "pass" && !onlyKeys) fail(here, `Show answer didn't leave the sheet right (${g.message ?? g.note ?? g.status})`);
    }
  }

  // Whatever happened, get past this task so the rest can be tested
  if (!(await page("window.__excelTest.info().solved"))) {
    await T("showAnswer()");
    await until("window.__excelTest.info().solved", 3000);
  }
}

async function playCourse({ showAnswers }) {
  await send("Page.navigate", { url: `${SITE}/learn/excel/${lessons[0].id}` });
  for (let n = 0; n < lessons.length; n++) {
    const lesson = lessons[n];
    if (!(await until(`window.__excelTest?.info().id === ${JSON.stringify(lesson.id)} && window.__excelTest.info().ready`, 30000))) {
      fail(lesson.file, "the lesson page didn't open (or the spreadsheet didn't load)");
      return;
    }
    // --only=lesson-07 tests just that lesson (the ones before it are skipped through)
    const only = process.argv.find((a) => a.startsWith("--only="))?.slice(7);
    if (only && !lesson.file.startsWith(only)) {
      await T("finishNow()");
      await sleep(200);
      if (lessons[n + 1]) await page(`document.querySelector('a[href="/learn/excel/${lessons[n + 1].id}"]')?.click()`);
      continue;
    }
    await T("start()");
    await until("window.__excelTest.info().started");
    for (let i = 0; i < lesson.tasks.length; i++) {
      // Show answer on every other task, so each next task proves the shown answer left the sheet right
      await playTask(lesson, i, { useShowAnswer: showAnswers && i % 2 === 0, testStructure: !showAnswers && i === 0 });
      await T("next()");
    }
    checks++;
    if (!(await until("window.__excelTest.info().finished", 3000))) fail(lesson.file, "the lesson didn't finish after its last task");
    const next = lessons[n + 1];
    if (next) {
      // Same as clicking the next lesson in the list, so progress carries over
      await page(`document.querySelector('a[href="/learn/excel/${next.id}"]')?.click()`);
    }
  }
}

await send("Page.enable");
await send("Runtime.enable");
await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
await send("Page.addScriptToEvaluateOnNewDocument", { source: "window.__excelTestMode = true;" });

console.log(`Testing ${lessons.length} Excel lessons (${lessons.reduce((n, l) => n + l.tasks.length, 0)} tasks)…`);
console.log("  Pass 1: answers, wrong answers, locks, selections and shortcuts");
await playCourse({ showAnswers: false });
console.log("  Pass 2: Show answer on every other task");
await playCourse({ showAnswers: true });

if (problems.length === 0) {
  console.log(`\n✓ All ${checks} checks passed.`);
  await stopAll(0);
} else {
  console.log(`\n✗ ${problems.length} problem${problems.length === 1 ? "" : "s"} (${checks} checks):`);
  for (const p of problems) console.log(`  • ${p.where}: ${p.what}`);
  await stopAll(1);
}
