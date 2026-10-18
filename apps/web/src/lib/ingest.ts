import { execFile } from "node:child_process";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

import {
  caseFromSource,
  listCases,
  parseRepoSource,
  sourceExtension,
  writeCatalog,
  type CaseRecord,
  type GitSource,
} from "@/lib/cases";
import { loadCallGraph } from "@/lib/load";
import type { Corpus, Survey } from "@/lib/model";
import { repoRoot } from "@/lib/paths";
import { cellNumber, rowsOf } from "@/lib/rows";
import { scanSources } from "@/lib/scan";
import { readRepoSurvey, readSurvey } from "@/lib/tools";

const exec = promisify(execFile);

export async function openCase(id: string, depth: number, selectedId?: string): Promise<Survey> {
  const item = (await listCases()).find((entry) => entry.id === id);
  if (!item) throw new Error("unknown repo");
  const { useGraph } = await import("@/lib/graph");
  const graph = await useGraph(item.graph);
  if (item.verdict) {
    const { ensureLoaded } = await import("@/lib/ready");
    await ensureLoaded(graph);
    const survey = await readSurvey(graph, depth);
    return { ...survey, caseId: item.id, caseLabel: item.label, verdict: true };
  }
  const corpus = JSON.parse(await readFile(path.join(repoRoot(), item.extractFile), "utf8")) as Corpus;
  await ensureCallGraph(graph, corpus);
  return readRepoSurvey(graph, depth, corpus, item, selectedId);
}

export async function addRepo(input: { source?: string; ref?: string; preset?: string }): Promise<CaseRecord> {
  const source =
    input.preset === "extractor" ? path.join(repoRoot(), "crates", "extract") : (input.source ?? "").trim();
  const parsed = parseRepoSource(source, input.ref);
  const tag = parsed.kind === "git" ? (parsed.ref ?? "HEAD") : "local";
  const checkout = parsed.kind === "local" ? parsed.path : path.join(repoRoot(), "corpus", "src", parsed.slug);
  let root = checkout;
  if (parsed.kind === "git" && parsed.scope === "file") {
    await writeDirectFile(parsed, checkout);
  } else if (parsed.kind === "git") {
    await cloneRepo(parsed, checkout);
    if (parsed.scope === "tree" && parsed.path) root = await resolveTree(parsed, checkout);
  }
  const record = caseFromSource(parsed, tag);
  const corpus = (await isRustCrate(root))
    ? await extractRust(root, record.repo, record.tag)
    : scanSources(await readSources(root), record.repo, record.tag);
  if (!corpus.functions.length) throw new Error("no functions found");
  const file = path.join(repoRoot(), record.extractFile);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify(corpus)}\n`);
  const current = (await listCases()).filter((item) => !item.verdict && item.id !== record.id);
  await writeCatalog([...current, record]);
  const { useGraph } = await import("@/lib/graph");
  const graph = await useGraph(record.graph);
  try {
    await graph.deleteGraph();
  } catch {
    // The case graph is created by the load.
  }
  await loadCallGraph(graph, corpus);
  return record;
}

async function ensureCallGraph(
  graph: { read: (query: string) => Promise<{ data?: unknown }>; write: (query: string, params?: Record<string, unknown>) => Promise<unknown> },
  corpus: Corpus,
) {
  const existing = await graph.read("MATCH (f:Function) RETURN count(f) AS n");
  if ((cellNumber(rowsOf(existing)[0]?.n) ?? 0) > 0) return;
  await loadCallGraph(graph as never, corpus);
}

async function cloneRepo(source: GitSource, root: string) {
  const srcRoot = path.join(repoRoot(), "corpus", "src");
  if (!root.startsWith(`${srcRoot}${path.sep}`)) throw new Error("clone path escaped the corpus directory");
  await rm(root, { recursive: true, force: true });
  await mkdir(srcRoot, { recursive: true });
  const args = ["clone", "--depth", "1"];
  if (source.ref) args.push("--branch", source.ref);
  args.push(source.url, root);
  await exec("git", args, { timeout: 120_000 });
}

async function writeDirectFile(source: GitSource, root: string) {
  const srcRoot = path.join(repoRoot(), "corpus", "src");
  if (!root.startsWith(`${srcRoot}${path.sep}`)) throw new Error("download path escaped the corpus directory");
  const file = source.path;
  if (!file || !sourceExtension(file)) throw new Error("link a source file such as .py, .js, .ts, .go, .java, or .rs");
  const text = await downloadText(rawUrl(source));
  await rm(root, { recursive: true, force: true });
  if (file.endsWith(".rs")) {
    const dest = path.join(root, rustDest(file));
    if (!dest.startsWith(`${root}${path.sep}`)) throw new Error("download path escaped the corpus directory");
    await mkdir(path.dirname(dest), { recursive: true });
    await writeFile(dest, text);
    await writeFile(path.join(root, "Cargo.toml"), "[package]\nname = \"added\"\nversion = \"0.0.0\"\nedition = \"2021\"\n");
    return;
  }
  const dest = path.join(root, file);
  if (!dest.startsWith(`${root}${path.sep}`)) throw new Error("download path escaped the corpus directory");
  await mkdir(path.dirname(dest), { recursive: true });
  await writeFile(dest, text);
}

async function resolveTree(source: GitSource, checkout: string): Promise<string> {
  const sub = contained(checkout, source.path ?? "");
  if (await isRustCrate(sub)) return sub;
  if ((await isRustCrate(checkout)) && sub.startsWith(`${checkout}${path.sep}`)) return checkout;
  if (await hasSource(sub)) return sub;
  if (await hasSource(checkout)) return checkout;
  throw new Error("that folder has no source files");
}

async function extractRust(root: string, repo: string, tag: string): Promise<Corpus> {
  const { stdout } = await exec(
    "cargo",
    ["run", "--quiet", "--manifest-path", path.join(repoRoot(), "crates/extract/Cargo.toml"), "--", root, repo, tag],
    { cwd: repoRoot(), timeout: 180_000, maxBuffer: 32 * 1024 * 1024 },
  );
  return JSON.parse(stdout) as Corpus;
}

async function isRustCrate(root: string): Promise<boolean> {
  const manifest = await readFile(path.join(root, "Cargo.toml")).then(() => true).catch(() => false);
  const src = await stat(path.join(root, "src")).then((item) => item.isDirectory()).catch(() => false);
  return manifest && src;
}

const SKIP_DIR = new Set([
  ".git",
  ".next",
  ".venv",
  "__pycache__",
  "build",
  "coverage",
  "dist",
  "node_modules",
  "out",
  "target",
  "vendor",
  "venv",
]);

async function readSources(root: string): Promise<Array<{ file: string; text: string }>> {
  const files = await sourceFiles(root);
  const picked = files.slice(0, 200);
  const rows: Array<{ file: string; text: string }> = [];
  for (const full of picked) {
    const text = await readFile(full, "utf8").catch(() => "");
    if (!text || text.length > 400_000) continue;
    rows.push({ file: path.relative(root, full).split(path.sep).join("/"), text });
  }
  return rows;
}

async function hasSource(dir: string): Promise<boolean> {
  return (await sourceFiles(dir)).length > 0;
}

async function sourceFiles(dir: string): Promise<string[]> {
  const found: string[] = [];
  const { readdir } = await import("node:fs/promises");
  async function walk(current: string) {
    if (found.length >= 200) return;
    let entries;
    try {
      entries = await readdir(current, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.name.startsWith(".") || SKIP_DIR.has(entry.name)) continue;
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) await walk(full);
      else if (entry.isFile() && sourceExtension(entry.name) && found.length < 200) found.push(full);
    }
  }
  await walk(dir);
  return found;
}

function rawUrl(source: GitSource): string {
  const ref = source.ref ?? "HEAD";
  const project = source.url.replace(/^https:\/\//, "").replace(/\.git$/, "");
  const file = source.path ?? "";
  if (source.host === "github.com") return `https://raw.githubusercontent.com/${project.slice("github.com/".length)}/${ref}/${file}`;
  if (source.host === "gitlab.com") return `https://${project}/-/raw/${ref}/${file}`;
  const kind = source.refKind ?? "branch";
  return `https://${project}/raw/${kind}/${ref}/${file}`;
}

async function downloadText(url: string): Promise<string> {
  const response = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(20_000) });
  const finalHost = new URL(response.url).hostname.toLowerCase();
  if (!["raw.githubusercontent.com", "gitlab.com", "codeberg.org", "github.com"].includes(finalHost)) {
    throw new Error("download left the allowed host");
  }
  if (!response.ok) throw new Error(`could not download that file (${response.status})`);
  const text = await response.text();
  if (text.length > 1_000_000) throw new Error("that file is too large");
  if (text.startsWith("<!DOCTYPE html") || text.startsWith("<html")) {
    throw new Error("the link returned a page instead of source");
  }
  return text;
}

function rustDest(file: string): string {
  const normal = file.replace(/^\/+/, "");
  if (normal === "src" || normal.startsWith("src/")) return normal;
  return path.posix.join("src", path.posix.basename(normal));
}

function contained(root: string, child: string): string {
  const resolved = path.resolve(root, child);
  if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) {
    throw new Error("download path escaped the corpus directory");
  }
  return resolved;
}
