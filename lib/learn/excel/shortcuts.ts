// Every Excel shortcut a lesson can teach, with the keys on Windows and on Mac.
// A lesson task names one by its id (e.g. "jump_down"). Formulas are the same on both;
// only shortcuts differ. Key names: Ctrl, Shift, Alt, Cmd, Option, a letter or digit,
// Up/Down/Left/Right, Enter, Tab, Esc, Space, Delete, Backspace, F1–F12, "=", ";".
//
// Some Excel shortcuts never reach a web page because the browser keeps them (⌘+T opens a
// new tab). For those, `browser` says what the browser does, and `instead` gives the keys
// that work here. The real Excel keys are still shown, as information.

export type OS = "windows" | "mac";
export type Keys = string[];

export type Shortcut = {
  action: string; // what it does, in plain words ("Jump to the bottom of the data")
  windows: Keys;
  mac: Keys;
  browser?: Partial<Record<OS, string>>; // what the browser does with those keys instead
  instead?: Partial<Record<OS, Keys>>; // keys to press here when the browser keeps the real ones
};

export const SHORTCUTS = {
  jump_down: { action: "Jump to the bottom of the data", windows: ["Ctrl", "Down"], mac: ["Cmd", "Down"] },
  jump_up: { action: "Jump to the top of the data", windows: ["Ctrl", "Up"], mac: ["Cmd", "Up"] },
  jump_left: { action: "Jump to the left edge of the data", windows: ["Ctrl", "Left"], mac: ["Cmd", "Left"] },
  jump_right: { action: "Jump to the right edge of the data", windows: ["Ctrl", "Right"], mac: ["Cmd", "Right"] },
  select_down: { action: "Select down to the bottom of the data", windows: ["Ctrl", "Shift", "Down"], mac: ["Cmd", "Shift", "Down"] },
  select_up: { action: "Select up to the top of the data", windows: ["Ctrl", "Shift", "Up"], mac: ["Cmd", "Shift", "Up"] },
  select_left: { action: "Select left to the edge of the data", windows: ["Ctrl", "Shift", "Left"], mac: ["Cmd", "Shift", "Left"] },
  select_right: { action: "Select right to the edge of the data", windows: ["Ctrl", "Shift", "Right"], mac: ["Cmd", "Shift", "Right"] },
  select_all: { action: "Select everything", windows: ["Ctrl", "A"], mac: ["Cmd", "A"] },
  copy: { action: "Copy", windows: ["Ctrl", "C"], mac: ["Cmd", "C"] },
  cut: { action: "Cut", windows: ["Ctrl", "X"], mac: ["Cmd", "X"] },
  paste: { action: "Paste", windows: ["Ctrl", "V"], mac: ["Cmd", "V"] },
  undo: { action: "Undo", windows: ["Ctrl", "Z"], mac: ["Cmd", "Z"] },
  bold: { action: "Make it bold", windows: ["Ctrl", "B"], mac: ["Cmd", "B"] },
  italic: { action: "Make it italic", windows: ["Ctrl", "I"], mac: ["Cmd", "I"] },
  underline: { action: "Underline it", windows: ["Ctrl", "U"], mac: ["Cmd", "U"] },
  edit_cell: { action: "Edit the cell you're on", windows: ["F2"], mac: ["F2"] },
  new_line_in_cell: { action: "Start a new line inside the cell", windows: ["Alt", "Enter"], mac: ["Option", "Enter"] },
  autosum: {
    action: "AutoSum: add up the numbers above",
    windows: ["Alt", "="],
    mac: ["Cmd", "Shift", "T"],
    browser: { mac: "reopens your last closed tab" },
    instead: { mac: ["Option", "="] },
  },
  lock_reference: {
    action: "Lock the reference with $ (while typing a formula)",
    windows: ["F4"],
    mac: ["Cmd", "T"],
    browser: { mac: "opens a new tab" },
    instead: { mac: ["F4"] },
  },
} satisfies Record<string, Shortcut>;

export type ShortcutId = keyof typeof SHORTCUTS;
export const SHORTCUT_IDS = Object.keys(SHORTCUTS) as [ShortcutId, ...ShortcutId[]];

// The keys to press for a shortcut on this OS, and the real Excel keys if the browser keeps them
export function keysFor(id: ShortcutId, os: OS): { press: Keys | null; excel: Keys; browser?: string } {
  const s: Shortcut = SHORTCUTS[id];
  const excel = s[os];
  const browser = s.browser?.[os];
  if (!browser) return { press: excel, excel };
  return { press: s.instead?.[os] ?? null, excel, browser };
}

// ---------- Reading key presses ----------

const CODE_NAMES: Record<string, string> = {
  ArrowDown: "Down",
  ArrowUp: "Up",
  ArrowLeft: "Left",
  ArrowRight: "Right",
  Enter: "Enter",
  NumpadEnter: "Enter",
  Tab: "Tab",
  Escape: "Esc",
  Space: "Space",
  Delete: "Delete",
  Backspace: "Backspace",
  Home: "Home",
  End: "End",
  PageUp: "PageUp",
  PageDown: "PageDown",
  Equal: "=",
  Minus: "-",
  Semicolon: ";",
  Comma: ",",
  Period: ".",
  Slash: "/",
  Backquote: "`",
};

// A key press as key names, e.g. ["Cmd", "Shift", "Down"]. Null for a modifier on its own.
// Uses the key's place on the keyboard, so Shift+4 is "4" (not "$").
export function keysOf(e: KeyboardEvent, os: OS): Keys | null {
  const c = e.code;
  const key = /^Key[A-Z]$/.test(c)
    ? c.slice(3)
    : /^Digit\d$/.test(c)
      ? c.slice(5)
      : /^F\d{1,2}$/.test(c)
        ? c
        : CODE_NAMES[c];
  if (!key) return null;
  const mods: Keys = [];
  if (e.ctrlKey) mods.push("Ctrl");
  if (e.altKey) mods.push(os === "mac" ? "Option" : "Alt");
  if (e.shiftKey) mods.push("Shift");
  if (e.metaKey) mods.push(os === "mac" ? "Cmd" : "Win");
  return [...mods, key];
}

// Same keys, in any order ("Option" and "Alt" are the same key)
const norm = (keys: Keys) => keys.map((k) => (k === "Option" ? "Alt" : k)).sort().join("+");
export const sameKeys = (a: Keys, b: Keys) => norm(a) === norm(b);

// How a key looks on screen, e.g. "⌘" on a Mac, "Ctrl" on Windows
const ARROWS: Record<string, string> = { Up: "↑", Down: "↓", Left: "←", Right: "→" };
export function keyLabel(key: string, os: OS): string {
  if (ARROWS[key]) return ARROWS[key];
  if (os === "mac") {
    if (key === "Cmd") return "⌘";
    if (key === "Option" || key === "Alt") return "⌥ Option";
    if (key === "Ctrl") return "⌃ Control";
  }
  return key;
}
