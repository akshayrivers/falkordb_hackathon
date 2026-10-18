import path from "node:path";

export function repoRoot(): string {
  const cwd = process.cwd();
  if (cwd.endsWith(`${path.sep}web`)) return path.resolve(cwd, "../..");
  return cwd;
}
