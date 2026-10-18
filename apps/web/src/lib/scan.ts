import type { Corpus, FunctionRow } from "@/lib/model";

const SKIP_CALL = new Set([
  "assert",
  "await",
  "case",
  "catch",
  "class",
  "def",
  "defined",
  "delete",
  "elif",
  "else",
  "except",
  "fn",
  "for",
  "foreach",
  "func",
  "function",
  "if",
  "instanceof",
  "match",
  "new",
  "return",
  "sizeof",
  "switch",
  "synchronized",
  "typeof",
  "while",
  "with",
]);

const HEADER =
  /(?:^|\n)[ \t]*(?:(?:public|private|protected|internal|static|final|virtual|inline|override|async|export|default|extern|const|unsigned|signed|mutable|volatile|constexpr|void|int|long|short|char|bool|boolean|string|String|auto|var|val|fun|func|fn|function|def|local|task|sub)\s+)*([A-Za-z_$][\w$]*)\s*\([^;{}]{0,500}\)\s*(?:const\s*)?(?:->\s*[\w:<>,|&*\s]{0,80}\s*)?\{/g;

const GO_METHOD =
  /(?:^|\n)[ \t]*func\s+\([^)\n]{0,200}\)\s*([A-Za-z_]\w*)\s*\([^;{}]{0,500}\)\s*\{/g;

const ARROW =
  /(?:^|\n)[ \t]*(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:function\b|\([^;{}]{0,300}\)|[A-Za-z_$][\w$]*)\s*=>\s*\{/g;

type Span = {
  name: string;
  qual: string;
  file: string;
  line: number;
  body: string;
  bodyLine: number;
};

export function scanSources(files: Array<{ file: string; text: string }>, repo: string, tag: string): Corpus {
  const spans: Span[] = [];
  for (const item of files) {
    if (spans.length >= 4000) break;
    spans.push(...spansIn(item.file.replaceAll("\\", "/"), item.text));
  }
  const byName = new Map<string, FunctionRow[]>();
  const functions: FunctionRow[] = spans.map((span) => {
    const row: FunctionRow = {
      id: `${span.file}::${span.qual}`,
      name: span.name,
      qual: span.qual,
      file: span.file,
      line: span.line,
      headerOverrideLine: null,
    };
    const list = byName.get(span.name) ?? [];
    list.push(row);
    byName.set(span.name, list);
    return row;
  });
  const seenId = new Set<string>();
  for (const row of functions) {
    if (!seenId.has(row.id)) {
      seenId.add(row.id);
      continue;
    }
    row.id = `${row.id}:${row.line}`;
    row.qual = `${row.qual}:${row.line}`;
  }
  const externals = new Map<string, { id: string; name: string; path: string }>();
  const calls: Corpus["calls"] = [];
  for (const [index, span] of spans.entries()) {
    const caller = functions[index];
    if (!caller) continue;
    let order = 0;
    for (const call of callsIn(span.body, span.bodyLine)) {
      order += 1;
      if (order > 80) break;
      const callee = resolveCallee(call.name, caller.file, byName, externals);
      calls.push({
        callerId: caller.id,
        calleeId: callee,
        calleeName: call.name,
        order,
        line: call.line,
        insideHeaderOverride: false,
      });
    }
  }
  return {
    repo,
    tag,
    functions,
    calls,
    externals: [...externals.values()],
    config: { file: "", flags: [] },
    build: { workflow: "", dockerfile: "", pushesImage: false },
  };
}

function spansIn(file: string, text: string): Span[] {
  const ext = file.slice(file.lastIndexOf(".")).toLowerCase();
  if (ext === ".py") return pythonSpans(file, text);
  if (ext === ".rb") return rubySpans(file, text);
  return braceSpans(file, text);
}

function pythonSpans(file: string, text: string): Span[] {
  const lines = mask(text, "py").split("\n");
  const classes: Array<{ indent: number; name: string }> = [];
  const spans: Span[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    const classMatch = /^( *)class\s+([A-Za-z_]\w*)\b/.exec(line);
    if (classMatch) {
      const indent = classMatch[1]?.length ?? 0;
      while (classes.length > 0 && (classes.at(-1)?.indent ?? 0) >= indent) classes.pop();
      classes.push({ indent, name: classMatch[2] ?? "Class" });
    }
    const match = /^( *)(?:async\s+)?def\s+([A-Za-z_]\w*)\s*\(/.exec(line);
    if (!match) continue;
    const indent = match[1]?.length ?? 0;
    while (classes.length > 0 && (classes.at(-1)?.indent ?? 0) >= indent) classes.pop();
    const name = match[2] ?? "fn";
    let end = index + 1;
    while (end < lines.length) {
      const next = lines[end] ?? "";
      if (next.trim() === "") {
        end += 1;
        continue;
      }
      const nextIndent = /^ */.exec(next)?.[0].length ?? 0;
      if (nextIndent <= indent) break;
      if (/^(?: *)(?:async\s+)?def\s+/.test(next) || /^(?: *)class\s+/.test(next)) break;
      end += 1;
    }
    const qual = classes.length > 0 ? `${classes.map((item) => item.name).join(".")}.${name}` : name;
    spans.push({
      name,
      qual,
      file,
      line: index + 1,
      body: lines.slice(index + 1, end).join("\n"),
      bodyLine: index + 2,
    });
  }
  return spans;
}

function rubySpans(file: string, text: string): Span[] {
  const lines = mask(text, "hash").split("\n");
  const spans: Span[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    const match = /^[ \t]*def\s+(?:self\.)?([A-Za-z_]\w*[!?]?)/.exec(lines[index] ?? "");
    if (!match) continue;
    const indent = /^ */.exec(lines[index] ?? "")?.[0].length ?? 0;
    let end = index + 1;
    while (end < lines.length) {
      const next = lines[end] ?? "";
      if (/^[ \t]*end\b/.test(next) && (/^ */.exec(next)?.[0].length ?? 0) <= indent) break;
      end += 1;
    }
    spans.push({
      name: match[1] ?? "fn",
      qual: match[1] ?? "fn",
      file,
      line: index + 1,
      body: lines.slice(index + 1, end).join("\n"),
      bodyLine: index + 2,
    });
  }
  return spans;
}

function braceSpans(file: string, text: string): Span[] {
  const masked = mask(text, "c");
  const spans: Span[] = [];
  const patterns = [GO_METHOD, HEADER, ARROW];
  const taken: Array<[number, number]> = [];
  for (const pattern of patterns) {
    pattern.lastIndex = 0;
    for (const match of masked.matchAll(pattern)) {
      const name = match[1] ?? "";
      if (!name || SKIP_CALL.has(name)) continue;
      const start = match.index ?? 0;
      if (taken.some(([from, to]) => start >= from && start < to)) continue;
      const open = masked.indexOf("{", start + match[0].length - 1);
      if (open < 0) continue;
      const close = closeBrace(masked, open);
      if (close < 0) continue;
      taken.push([start, close]);
      const line = masked.slice(0, start).split("\n").length;
      spans.push({
        name,
        qual: name,
        file,
        line,
        body: masked.slice(open + 1, close),
        bodyLine: masked.slice(0, open + 1).split("\n").length,
      });
    }
  }
  spans.sort((a, b) => a.line - b.line);
  return spans;
}

function callsIn(body: string, bodyLine: number): Array<{ name: string; line: number }> {
  const found: Array<{ name: string; line: number }> = [];
  for (const match of body.matchAll(/([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*)\s*\(/g)) {
    const name = match[1] ?? "";
    const head = name.split(".")[0] ?? name;
    if (!name || SKIP_CALL.has(head) || SKIP_CALL.has(name)) continue;
    const line = bodyLine + body.slice(0, match.index ?? 0).split("\n").length - 1;
    found.push({ name, line });
  }
  return found;
}

function resolveCallee(
  name: string,
  file: string,
  byName: Map<string, FunctionRow[]>,
  externals: Map<string, { id: string; name: string; path: string }>,
): string {
  const bare = name.split(".").at(-1) ?? name;
  if (!name.includes(".")) {
    const locals = byName.get(bare) ?? [];
    const same = locals.find((row) => row.file === file);
    const hit = same ?? locals[0];
    if (hit) return hit.id;
  }
  const id = `external::${name}`;
  if (!externals.has(id)) externals.set(id, { id, name, path: "external" });
  return id;
}

function closeBrace(text: string, open: number): number {
  let depth = 0;
  for (let index = open; index < text.length; index += 1) {
    const char = text[index];
    if (char === "{") depth += 1;
    else if (char === "}") {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return -1;
}

function mask(text: string, kind: "py" | "hash" | "c"): string {
  const chars = [...text];
  let index = 0;
  while (index < chars.length) {
    const char = chars[index];
    const next = chars[index + 1];
    if (kind !== "c" && char === "#") {
      index = blankUntil(chars, index, (item) => item === "\n");
      continue;
    }
    if (kind === "c" && char === "/" && next === "/") {
      index = blankUntil(chars, index, (item) => item === "\n");
      continue;
    }
    if (kind === "c" && char === "/" && next === "*") {
      chars[index] = " ";
      chars[index + 1] = " ";
      index += 2;
      while (index < chars.length && !(chars[index] === "*" && chars[index + 1] === "/")) {
        if (chars[index] !== "\n") chars[index] = " ";
        index += 1;
      }
      if (chars[index] === "*") chars[index] = " ";
      if (chars[index + 1] === "/") chars[index + 1] = " ";
      index += 2;
      continue;
    }
    if (kind === "py" && (char === '"' || char === "'") && chars[index + 1] === char && chars[index + 2] === char) {
      const quote = char;
      chars[index] = " ";
      chars[index + 1] = " ";
      chars[index + 2] = " ";
      index += 3;
      while (index < chars.length && !(chars[index] === quote && chars[index + 1] === quote && chars[index + 2] === quote)) {
        if (chars[index] !== "\n") chars[index] = " ";
        index += 1;
      }
      index += 3;
      continue;
    }
    if (char === '"' || char === "'" || (kind === "c" && char === "`")) {
      const quote = char;
      chars[index] = " ";
      index += 1;
      while (index < chars.length && chars[index] !== quote) {
        if (chars[index] === "\\" && chars[index + 1] !== "\n") {
          chars[index] = " ";
          chars[index + 1] = " ";
          index += 2;
          continue;
        }
        if (chars[index] !== "\n") chars[index] = " ";
        index += 1;
      }
      if (chars[index] === quote) chars[index] = " ";
      index += 1;
      continue;
    }
    index += 1;
  }
  return chars.join("");
}

function blankUntil(chars: string[], start: number, done: (char: string) => boolean): number {
  let index = start;
  while (index < chars.length && !done(chars[index] ?? "")) {
    chars[index] = " ";
    index += 1;
  }
  return index;
}
