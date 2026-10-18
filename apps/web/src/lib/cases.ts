import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { GRAPH_NAME } from "@/lib/model";
import { repoRoot } from "@/lib/paths";

export type CaseRecord = {
  id: string;
  label: string;
  repo: string;
  tag: string;
  extractFile: string;
  graph: string;
  verdict: boolean;
};

export const RUSTYPASTE_CASE: CaseRecord = {
  id: "rustypaste",
  label: "rustypaste v0.18.0",
  repo: "orhun/rustypaste",
  tag: "v0.18.0",
  extractFile: "corpus/extract.json",
  graph: GRAPH_NAME,
  verdict: true,
};

const SOURCE_EXTENSIONS = new Set([
  ".c",
  ".cc",
  ".cpp",
  ".cs",
  ".cxx",
  ".go",
  ".h",
  ".hh",
  ".hpp",
  ".java",
  ".js",
  ".jsx",
  ".kt",
  ".kts",
  ".lua",
  ".mjs",
  ".php",
  ".py",
  ".rb",
  ".rs",
  ".scala",
  ".swift",
  ".ts",
  ".tsx",
]);

export function sourceExtension(file: string): string | null {
  const lower = file.toLowerCase();
  const dot = lower.lastIndexOf(".");
  if (dot < 0) return null;
  const ext = lower.slice(dot);
  return SOURCE_EXTENSIONS.has(ext) ? ext : null;
}

const HOSTS = new Set(["github.com", "gitlab.com", "codeberg.org", "raw.githubusercontent.com"]);

export type GitScope = "repo" | "tree" | "file";

export type GitSource = {
  kind: "git";
  url: string;
  slug: string;
  label: string;
  ref?: string;
  path?: string;
  scope: GitScope;
  host: "github.com" | "gitlab.com" | "codeberg.org";
  refKind?: "branch" | "tag";
};
export type LocalSource = { kind: "local"; path: string; slug: string; label: string };
export type RepoSource = GitSource | LocalSource;

export function catalogPath(): string {
  return path.join(repoRoot(), "corpus", "catalog.json");
}

export async function listCases(): Promise<CaseRecord[]> {
  const added = await readCatalog();
  const rest = added.filter((item) => item.id !== RUSTYPASTE_CASE.id);
  return [RUSTYPASTE_CASE, ...rest];
}

export function parseRepoSource(input: string, refName?: string): RepoSource {
  const source = input.trim();
  const gitRef = cleanRef(refName);
  if (source.startsWith("https://")) return parseGit(source, gitRef);
  if (source.startsWith("/")) return parseLocal(source);
  throw new Error("use an https git URL or an absolute path to a Rust crate");
}

function parseGit(input: string, refName?: string): GitSource {
  if (/\.\.|%2e|%2f|%5c/i.test(input)) throw new Error("path has unsupported characters");
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new Error("git URL is not valid");
  }
  if (url.protocol !== "https:" || url.username || url.password) {
    throw new Error("git URL must be https and must not include credentials");
  }
  const host = url.hostname.toLowerCase();
  if (!HOSTS.has(host)) throw new Error("git host must be github.com, gitlab.com, or codeberg.org");
  const parts = url.pathname.split("/").filter(Boolean).map(decodePart);
  if (host === "raw.githubusercontent.com") return parseRawGithub(parts, refName);
  if (host === "gitlab.com") return parseGitlab(parts, refName);
  if (host === "codeberg.org") return parseCodeberg(parts, refName);
  return parseGithub(parts, refName);
}

function parseGithub(parts: string[], refName?: string): GitSource {
  if (parts.length < 2) throw new Error("git URL needs an owner and a repository");
  const owner = nameOf(parts[0] ?? "");
  const repo = nameOf((parts[1] ?? "").replace(/\.git$/, ""));
  const marker = parts[2];
  let scope: GitScope = "repo";
  let urlRef: string | undefined;
  let subpath: string[] = [];
  if (marker === "blob" || marker === "tree" || marker === "raw") {
    urlRef = refOf(parts[3] ?? "");
    subpath = parts.slice(4);
    scope = marker === "tree" ? (subpath.length > 0 ? "tree" : "repo") : "file";
  } else if (marker === "commit") {
    urlRef = refOf(parts[3] ?? "");
  } else if (marker) {
    throw new Error("git URL path is not a repository, tree, or file");
  }
  return finishGit("github.com", owner, repo, scope, subpath, refName ?? urlRef);
}

function parseRawGithub(parts: string[], refName?: string): GitSource {
  if (parts.length < 3) throw new Error("raw URL needs an owner, repository, and ref");
  const owner = nameOf(parts[0] ?? "");
  const repo = nameOf(parts[1] ?? "");
  const urlRef = refOf(parts[2] ?? "");
  const subpath = parts.slice(3);
  const scope: GitScope = subpath.length === 0 ? "repo" : sourceExtension(subpath.at(-1) ?? "") ? "file" : "tree";
  return finishGit("github.com", owner, repo, scope, subpath, refName ?? urlRef);
}

function parseGitlab(parts: string[], refName?: string): GitSource {
  const cut = parts.indexOf("-");
  const project = (cut >= 2 ? parts.slice(0, cut) : parts).map((part, index, all) =>
    index === all.length - 1 ? nameOf(part.replace(/\.git$/, "")) : nameOf(part),
  );
  if (project.length < 2) throw new Error("git URL needs an owner and a repository");
  if (cut < 2) {
    if (parts.length !== 2) throw new Error("git URL path is not a repository, tree, or file");
    const repo = nameOf((parts[1] ?? "").replace(/\.git$/, ""));
    return finishGit("gitlab.com", nameOf(parts[0] ?? ""), repo, "repo", [], refName);
  }
  const action = parts[cut + 1];
  if (action !== "blob" && action !== "tree" && action !== "raw") {
    throw new Error("git URL path is not a repository, tree, or file");
  }
  const urlRef = refOf(parts[cut + 2] ?? "");
  const subpath = parts.slice(cut + 3);
  const scope: GitScope = action === "tree" ? (subpath.length > 0 ? "tree" : "repo") : "file";
  return finishGit("gitlab.com", project.slice(0, -1).join("/"), project.at(-1) ?? "", scope, subpath, refName ?? urlRef);
}

function parseCodeberg(parts: string[], refName?: string): GitSource {
  if (parts.length < 2) throw new Error("git URL needs an owner and a repository");
  const owner = nameOf(parts[0] ?? "");
  const repo = nameOf((parts[1] ?? "").replace(/\.git$/, ""));
  const view = parts[2];
  if (!view) return finishGit("codeberg.org", owner, repo, "repo", [], refName);
  if (view !== "src" && view !== "raw") throw new Error("git URL path is not a repository, tree, or file");
  const kind = parts[3];
  if (kind !== "branch" && kind !== "tag") throw new Error("codeberg URL needs branch or tag");
  const urlRef = refOf(parts[4] ?? "");
  const subpath = parts.slice(5);
  const file = view === "raw" || Boolean(sourceExtension(subpath.at(-1) ?? ""));
  const scope: GitScope = file ? "file" : subpath.length > 0 ? "tree" : "repo";
  return finishGit("codeberg.org", owner, repo, scope, subpath, refName ?? urlRef, kind === "tag" ? "tag" : "branch");
}

function finishGit(
  host: GitSource["host"],
  owner: string,
  repo: string,
  scope: GitScope,
  subpath: string[],
  ref?: string,
  refKind?: "branch" | "tag",
): GitSource {
  if (scope === "file" && !sourceExtension(subpath.at(-1) ?? "")) {
    throw new Error("link a source file such as .py, .js, .ts, .go, .java, or .rs");
  }
  const pathValue = joinPath(subpath);
  const slug = slugify([owner, repo, pathValue?.replaceAll("/", "-")].filter(Boolean).join("-"));
  return {
    kind: "git",
    url: `https://${host}/${owner}/${repo}.git`,
    slug,
    label: `${owner}/${repo}`,
    ref,
    path: pathValue,
    scope,
    host,
    refKind,
  };
}

function joinPath(parts: string[]): string | undefined {
  if (parts.length === 0) return undefined;
  return parts.join("/");
}

function decodePart(part: string): string {
  let value = part;
  try {
    value = decodeURIComponent(part);
  } catch {
    throw new Error("path has unsupported characters");
  }
  if (value === "." || value === ".." || value.includes("/") || value.includes("\\")) {
    throw new Error("path has unsupported characters");
  }
  return value;
}

function nameOf(value: string): string {
  if (!/^[\w.-]+$/.test(value)) throw new Error("repository name has unsupported characters");
  return value;
}

function refOf(value: string): string {
  if (value.includes("..") || !/^[\w./-]{1,80}$/.test(value)) {
    throw new Error("tag or branch has unsupported characters");
  }
  return value;
}

function parseLocal(input: string): LocalSource {
  const resolved = path.resolve(input);
  if (!resolved.startsWith("/")) throw new Error("local repo path must be absolute");
  return {
    kind: "local",
    path: resolved,
    slug: slugify(path.basename(resolved)),
    label: path.basename(resolved),
  };
}

function cleanRef(refName?: string): string | undefined {
  const value = refName?.trim();
  if (!value) return undefined;
  if (value.includes("..") || !/^[\w./-]{1,80}$/.test(value)) {
    throw new Error("tag or branch has unsupported characters");
  }
  return value;
}

export function slugify(value: string): string {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/g, "");
  return slug || "repo";
}

export function caseFromSource(source: RepoSource, tag: string): CaseRecord {
  const fileNote = source.kind === "git" && source.path ? ` ${source.path}` : "";
  return {
    id: source.slug,
    label: tag === "local" ? source.label : `${source.label}${fileNote} ${tag}`,
    repo: source.label,
    tag,
    extractFile: path.posix.join("corpus", "added", `${source.slug}.json`),
    graph: `case_${source.slug.replace(/-/g, "_")}`,
    verdict: false,
  };
}

async function readCatalog(): Promise<CaseRecord[]> {
  try {
    const raw = await readFile(catalogPath(), "utf8");
    const parsed = JSON.parse(raw) as CaseRecord[];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item) => item && item.id && item.extractFile && item.graph && item.verdict === false);
  } catch {
    return [];
  }
}

export async function writeCatalog(cases: CaseRecord[]): Promise<void> {
  const added = cases.filter((item) => !item.verdict);
  await writeFile(catalogPath(), `${JSON.stringify(added, null, 2)}\n`);
}
