import { readFileSync } from "node:fs";
import path from "node:path";

import { ConstraintType, EntityType, FalkorDB } from "falkordb";

import { repoRoot } from "@/lib/paths";
import type { Tabular } from "@/lib/rows";

export type GraphSession = {
  name: string;
  read: (query: string, params?: Record<string, unknown>) => Promise<Tabular>;
  write: (query: string, params?: Record<string, unknown>) => Promise<Tabular>;
  constraintOnFunctionId: () => Promise<void>;
  deleteGraph: () => Promise<void>;
  close: () => Promise<void>;
};

let shared: Promise<FalkorDB> | null = null;

export function falkorOptions() {
  return {
    socket: {
      host: envValue("FALKORDB_HOST") ?? "127.0.0.1",
      port: Number(envValue("FALKORDB_PORT") ?? 6379),
    },
  };
}

function envValue(name: string): string | undefined {
  const current = process.env[name];
  if (current) return current;
  try {
    const file = readFileSync(path.join(repoRoot(), ".env"), "utf8");
    for (const line of file.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const split = trimmed.indexOf("=");
      if (split < 0 || trimmed.slice(0, split) !== name) continue;
      return trimmed.slice(split + 1).trim();
    }
  } catch {
    return undefined;
  }
  return undefined;
}

function bind(db: FalkorDB, name: string, ownsClient: boolean): GraphSession {
  const graph = db.selectGraph(name);
  const run = (kind: "read" | "write", query: string, params?: Record<string, unknown>) => {
    const options = params ? { params: params as never } : undefined;
    return kind === "read" ? graph.roQuery(query, options) : graph.query(query, options);
  };
  return {
    name,
    read: (query, params) => run("read", query, params),
    write: (query, params) => run("write", query, params),
    constraintOnFunctionId: () =>
      graph.constraintCreate(ConstraintType.UNIQUE, EntityType.NODE, "Function", "id"),
    deleteGraph: () => graph.delete(),
    close: ownsClient ? () => db.close() : async () => {},
  };
}

export async function openGraph(name: string): Promise<GraphSession> {
  const db = await FalkorDB.connect(falkorOptions());
  return bind(db, name, true);
}

export async function useGraph(name: string): Promise<GraphSession> {
  shared ??= FalkorDB.connect(falkorOptions());
  return bind(await shared, name, false);
}
