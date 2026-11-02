"use client";

import { useEffect, useRef } from "react";
import { Compartment, EditorState, Prec } from "@codemirror/state";
import {
  drawSelection,
  EditorView,
  highlightActiveLine,
  highlightActiveLineGutter,
  keymap,
  lineNumbers,
  placeholder,
} from "@codemirror/view";
import { defaultKeymap, history, historyKeymap, indentLess, indentMore } from "@codemirror/commands";
import { bracketMatching, HighlightStyle, indentUnit, StreamLanguage, syntaxHighlighting } from "@codemirror/language";
import { r } from "@codemirror/legacy-modes/mode/r";
import { sql } from "@codemirror/lang-sql";
import { python } from "@codemirror/lang-python";
import { tags } from "@lezer/highlight";

// Colors come from the --sql-* variables in globals.css (used for Python too)
const codeColors = HighlightStyle.define([
  { tag: tags.keyword, color: "var(--sql-keyword)", fontWeight: "600" },
  { tag: [tags.function(tags.variableName), tags.standard(tags.name)], color: "var(--sql-function)" },
  { tag: tags.string, color: "var(--sql-string)" },
  { tag: tags.number, color: "var(--sql-number)" },
  { tag: [tags.comment, tags.lineComment, tags.blockComment], color: "var(--sql-comment)", fontStyle: "italic" },
]);

const editorTheme = EditorView.theme({
  "&": { height: "100%", fontSize: "14px", backgroundColor: "transparent" },
  "&.cm-focused": { outline: "none" },
  ".cm-scroller": { fontFamily: "var(--font-geist-mono), ui-monospace, monospace", lineHeight: "1.6" },
  ".cm-content": { caretColor: "var(--foreground)", padding: "8px 0" },
  ".cm-cursor": { borderLeftColor: "var(--foreground)" },
  ".cm-gutters": { backgroundColor: "transparent", border: "none", color: "#a1a1aa" },
  ".cm-activeLine": { backgroundColor: "rgba(127, 127, 127, 0.08)" },
  ".cm-activeLineGutter": { backgroundColor: "transparent", color: "var(--foreground)" },
  ".cm-selectionBackground, &.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground": {
    backgroundColor: "rgba(59, 130, 246, 0.25)",
  },
  ".cm-placeholder": { color: "#a1a1aa" },
});

// Python indents by 4 spaces, like Jupyter: Tab adds 4 spaces (or indents the selected lines),
// Shift+Tab takes them away, and Enter keeps the indent (adding 4 after a line ending in ":").
const pythonTab = [
  {
    key: "Tab",
    run: (view: EditorView) => {
      if (!view.state.selection.ranges.every((r) => r.empty)) return indentMore(view);
      view.dispatch(view.state.replaceSelection("    "));
      return true;
    },
    shift: indentLess,
  },
];

// R indents by 2 spaces, like RStudio
const rTab = [
  {
    key: "Tab",
    run: (view: EditorView) => {
      if (!view.state.selection.ranges.every((range) => range.empty)) return indentMore(view);
      view.dispatch(view.state.replaceSelection("  "));
      return true;
    },
    shift: indentLess,
  },
];

// What changes per language: the colors, the empty-editor text, and Tab (Python and R use it for indenting)
const LANGUAGES = {
  sql: { support: () => [sql()], placeholder: "Type your SQL here…", keys: [] },
  python: { support: () => [python(), indentUnit.of("    ")], placeholder: "Type your Python here…", keys: pythonTab },
  r: { support: () => [StreamLanguage.define(r), indentUnit.of("  ")], placeholder: "Type your R here…", keys: rTab },
};

// What Ctrl/Cmd+Enter (or a Run button) applies to: the whole text, the selection (from–to, empty
// when nothing is selected, then `from` is the cursor), and a way to move the cursor afterwards
export type RunTarget = { doc: string; from: number; to: number; moveCursor: (pos: number) => void };

// Code editor with line numbers and colors. Ctrl/Cmd+Enter runs the code.
// `controlRef`: lets a Run button outside the editor ask what to run, like Ctrl/Cmd+Enter does.
export default function CodeEditor({
  language,
  value,
  onChange,
  onRun,
  readOnly,
  controlRef,
}: {
  language: keyof typeof LANGUAGES;
  value: string;
  onChange: (value: string) => void;
  onRun: (target: RunTarget) => void;
  readOnly: boolean;
  controlRef?: React.RefObject<{ runTarget: () => RunTarget | null } | null>;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const editable = useRef(new Compartment());
  // Keep the latest callbacks without rebuilding the editor
  const onChangeRef = useRef(onChange);
  const onRunRef = useRef(onRun);
  useEffect(() => {
    onChangeRef.current = onChange;
    onRunRef.current = onRun;
  });

  // Create the editor once
  useEffect(() => {
    const view = new EditorView({
      parent: boxRef.current!,
      state: EditorState.create({
        doc: value,
        extensions: [
          Prec.highest(
            keymap.of([{ key: "Mod-Enter", run: (v) => (onRunRef.current(runTargetOf(v)), true) }])
          ),
          lineNumbers(),
          highlightActiveLineGutter(),
          highlightActiveLine(),
          history(),
          drawSelection(),
          bracketMatching(),
          keymap.of([...defaultKeymap, ...historyKeymap, ...LANGUAGES[language].keys]),
          LANGUAGES[language].support(),
          syntaxHighlighting(codeColors),
          editorTheme,
          EditorView.lineWrapping,
          placeholder(LANGUAGES[language].placeholder),
          editable.current.of([EditorState.readOnly.of(readOnly), EditorView.editable.of(!readOnly)]),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) onChangeRef.current(update.state.doc.toString());
          }),
        ],
      }),
    });
    viewRef.current = view;
    if (controlRef) controlRef.current = { runTarget: () => (viewRef.current ? runTargetOf(viewRef.current) : null) };
    return () => view.destroy();
    // Only on first render: later changes are applied by the effects below
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // New text from outside (e.g. a new task clears the editor)
  useEffect(() => {
    const view = viewRef.current;
    if (view && view.state.doc.toString() !== value) {
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: value } });
    }
  }, [value]);

  useEffect(() => {
    viewRef.current?.dispatch({
      effects: editable.current.reconfigure([
        EditorState.readOnly.of(readOnly),
        EditorView.editable.of(!readOnly),
      ]),
    });
  }, [readOnly]);

  return <div ref={boxRef} className="h-full min-h-40" />;
}

function runTargetOf(view: EditorView): RunTarget {
  const { from, to } = view.state.selection.main;
  return {
    doc: view.state.doc.toString(),
    from,
    to,
    moveCursor: (pos) => view.dispatch({ selection: { anchor: Math.min(pos, view.state.doc.length) }, scrollIntoView: true }),
  };
}
