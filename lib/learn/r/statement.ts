// What Ctrl/Cmd+Enter runs, like RStudio: the selection if there is one, otherwise the whole
// statement on the cursor's line (a pipe or a ggplot spread over several lines counts as one),
// and where the cursor goes afterwards (the next line with code on it).

// Brackets still open in some code (negative: more closed than opened), and whether it ends inside
// a quote. Text in quotes and comments doesn't count.
function scan(code: string): { depth: number; inQuote: boolean } {
  let depth = 0;
  let quote: string | null = null;
  for (let i = 0; i < code.length; i++) {
    const ch = code[i];
    if (quote) {
      if (ch === "\\") i++;
      else if (ch === quote) quote = null;
    } else if (ch === '"' || ch === "'" || ch === "`") quote = ch;
    else if (ch === "#") while (i < code.length && code[i] !== "\n") i++;
    else if ("([{".includes(ch)) depth++;
    else if (")]}".includes(ch)) depth--;
  }
  return { depth, inQuote: quote !== null };
}

// The line carries on onto the next one: it ends with a pipe, an operator, a comma or an open bracket
const withoutComment = (line: string) => line.replace(/#[^"']*$/, "").trimEnd();
const continues = (line: string) => /(\|>|%[^%\s]*%|<-|[-+*/^,=&|~<>([{!])$/.test(withoutComment(line));

export function codeToRun(doc: string, from: number, to: number): { code: string; next: number } {
  if (from !== to) return { code: doc.slice(Math.min(from, to), Math.max(from, to)), next: Math.max(from, to) };

  const lines = doc.split("\n");
  const starts: number[] = [];
  lines.reduce((pos, line) => (starts.push(pos), pos + line.length + 1), 0);
  const cursorLine = Math.max(0, starts.findLastIndex((s) => s <= from));

  // Up: while the line before carries on into this one, or a bracket closes here that opened above
  let start = cursorLine;
  while (start > 0 && (continues(lines[start - 1]) || scan(lines.slice(start, cursorLine + 1).join("\n")).depth < 0)) start--;
  // Down: while the statement isn't finished (open brackets or quotes, or a line that carries on)
  let end = cursorLine;
  const open = () => {
    const s = scan(lines.slice(start, end + 1).join("\n"));
    return s.depth > 0 || s.inQuote || continues(lines[end]);
  };
  while (end < lines.length - 1 && open()) end++;

  // The cursor moves to the next line that has code on it
  let nextLine = end + 1;
  while (nextLine < lines.length && !lines[nextLine].trim()) nextLine++;
  const next = nextLine < lines.length ? starts[nextLine] : doc.length;
  return { code: lines.slice(start, end + 1).join("\n"), next };
}
