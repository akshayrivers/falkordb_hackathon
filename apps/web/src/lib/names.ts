export class StrangerNameError extends Error {
  readonly names: string[];

  constructor(names: string[]) {
    super(`stranger name: ${names.join(", ")}`);
    this.name = "StrangerNameError";
    this.names = names;
  }
}

export function mentionedNames(reasoning: string): string[] {
  const found: string[] = [];
  for (const match of reasoning.matchAll(/`([^`]+)`/g)) {
    const name = match[1]?.trim() ?? "";
    if (name.length > 0) found.push(name);
  }
  return found;
}

export function strangerNames(reasoning: string, allowed: ReadonlySet<string>): string[] {
  return [...new Set(mentionedNames(reasoning).filter((name) => !allowed.has(name)))];
}

export function assertNamesFromPayload(reasoning: string, allowed: ReadonlySet<string>): string[] {
  const strangers = strangerNames(reasoning, allowed);
  if (strangers.length > 0) throw new StrangerNameError(strangers);
  return mentionedNames(reasoning);
}

export function defaultReasoning(allowed: ReadonlySet<string>): string {
  const needed = ["store_file", "safe_path_join", "set_file_name", "store_url", "upload"];
  for (const name of needed) {
    if (!allowed.has(name)) {
      throw new Error(`payload is missing ${name}`);
    }
  }
  return "Uncovered path: `store_file` calls `safe_path_join` before `set_file_name`. Covered path: `store_url`. Entry: `upload`.";
}

export function stoppedReasoning(allowed: ReadonlySet<string>): string {
  const parts = ["The walk stopped before the header rename."];
  if (allowed.has("set_file_name")) parts.push("It does not reach `set_file_name`.");
  if (allowed.has("upload") && allowed.has("store_file")) {
    parts.push("`upload` stops before the rename in `store_file`.");
  }
  parts.push("No guard is stored.");
  const text = parts.join(" ");
  assertNamesFromPayload(text, allowed);
  return text;
}

export function alreadyGuardedReasoning(allowed: ReadonlySet<string>): string {
  const sink = allowed.has("store_file") ? "`store_file`" : "the function";
  const rename = allowed.has("set_file_name") ? "`set_file_name`" : "the header rename";
  const text = `${sink} already has a guard. cover returned no uncovered row for ${rename}.`;
  assertNamesFromPayload(text, allowed);
  return text;
}
