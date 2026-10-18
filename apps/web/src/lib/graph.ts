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
  const url = setting("FALKORDB_URL");
  const username = setting("FALKORDB_USERNAME");
  const password = setting("FALKORDB_PASSWORD");
  const tls = tlsEnabled(setting("FALKORDB_TLS"));
  const endpoint = endpointFrom(setting("FALKORDB_HOST"), setting("FALKORDB_PORT"));
  const auth = {
    ...(username ? { username } : {}),
    ...(password ? { password } : {}),
  };
  if (!url && !endpoint.host) {
    throw new Error("FALKORDB_HOST is empty on this deployment. Set it in Vercel, then redeploy.");
  }
  if (url) {
    return {
      url,
      ...auth,
      socket: {
        connectTimeout: 8000,
        ...(tls ? { tls: true as const } : {}),
      },
    };
  }
  return {
    ...auth,
    host: endpoint.host,
    port: endpoint.port,
    socket: {
      host: endpoint.host,
      port: endpoint.port,
      connectTimeout: 8000,
      ...(tls ? { tls: true as const } : {}),
    },
  };
}

function setting(name: FalkorSetting): string | undefined {
  const fromRuntime = clean(runtimeSetting(name));
  if (fromRuntime) return fromRuntime;
  return clean(fileSetting(name));
}

type FalkorSetting =
  | "FALKORDB_URL"
  | "FALKORDB_HOST"
  | "FALKORDB_PORT"
  | "FALKORDB_USERNAME"
  | "FALKORDB_PASSWORD"
  | "FALKORDB_TLS";

function runtimeSetting(name: FalkorSetting): string | undefined {
  if (name === "FALKORDB_URL") return process.env.FALKORDB_URL;
  if (name === "FALKORDB_HOST") return process.env.FALKORDB_HOST;
  if (name === "FALKORDB_PORT") return process.env.FALKORDB_PORT;
  if (name === "FALKORDB_USERNAME") return process.env.FALKORDB_USERNAME;
  if (name === "FALKORDB_PASSWORD") return process.env.FALKORDB_PASSWORD;
  return process.env.FALKORDB_TLS;
}

function fileSetting(name: string): string | undefined {
  if (process.env.VERCEL) return undefined;
  try {
    const file = readFileSync(path.join(repoRoot(), ".env"), "utf8");
    for (const line of file.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const split = trimmed.indexOf("=");
      if (split < 0 || trimmed.slice(0, split) !== name) continue;
      return trimmed.slice(split + 1);
    }
  } catch {
    return undefined;
  }
  return undefined;
}

function clean(value: string | undefined): string | undefined {
  if (!value) return undefined;
  let next = value.trim();
  if (
    (next.startsWith('"') && next.endsWith('"')) ||
    (next.startsWith("'") && next.endsWith("'"))
  ) {
    next = next.slice(1, -1).trim();
  }
  return next || undefined;
}

function tlsEnabled(value: string | undefined): boolean {
  const flag = value?.toLowerCase();
  return flag === "true" || flag === "1" || flag === "yes";
}

function endpointFrom(hostValue: string | undefined, portValue: string | undefined): { host: string; port: number } {
  let host = hostValue ?? "";
  let port = Number(portValue);
  const slash = host.indexOf("://");
  if (slash >= 0) host = host.slice(slash + 3);
  host = host.replace(/\/.*$/, "");
  const colon = host.lastIndexOf(":");
  if (colon > 0 && /^\d+$/.test(host.slice(colon + 1))) {
    port = Number(host.slice(colon + 1));
    host = host.slice(0, colon);
  }
  if (!host && !process.env.VERCEL) host = "127.0.0.1";
  if (!Number.isFinite(port) || port <= 0) port = 6379;
  return { host, port };
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
  try {
    shared ??= FalkorDB.connect(falkorOptions());
    return bind(await shared, name, false);
  } catch (error) {
    shared = null;
    throw error;
  }
}
