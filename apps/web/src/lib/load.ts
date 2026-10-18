import { readFile } from "node:fs/promises";
import path from "node:path";

import type { GraphSession } from "@/lib/graph";
import type { Corpus } from "@/lib/model";
import { RENAME_ID, SANITIZER_ID, SINK_ID, UPLOAD_ID } from "@/lib/model";
import { repoRoot } from "@/lib/paths";
import {
  indexExternal,
  indexFunction,
  mergeAdvisory,
  mergeCalls,
  mergeEnables,
  mergeExternals,
  mergeFunctions,
  mergeFlow,
  mergeShips,
} from "@/lib/queries";

const ADVISORY_TITLE =
  "Path traversal via the filename header bypasses the upload-directory sandbox";

export async function readCorpus(): Promise<Corpus> {
  const file = path.join(repoRoot(), "corpus", "extract.json");
  const raw = await readFile(file, "utf8");
  return JSON.parse(raw) as Corpus;
}

export async function loadCallGraph(graph: GraphSession, corpus: Corpus): Promise<void> {
  await ignoreExists(() => graph.write(indexFunction));
  await ignoreExists(() => graph.write(indexExternal));
  await ignoreExists(() => graph.constraintOnFunctionId());

  await batches(
    graph,
    mergeFunctions,
    corpus.functions.map((fn) => ({
      id: fn.id,
      name: fn.name,
      qual: fn.qual,
      file: fn.file,
      line: fn.line,
      headerOverrideLine: fn.headerOverrideLine ?? 0,
      repo: corpus.repo,
      tag: corpus.tag,
    })),
  );
  await batches(
    graph,
    mergeExternals,
    corpus.externals.map((external) => ({
      id: external.id,
      name: external.name,
      path: external.path,
    })),
  );
  await batches(
    graph,
    mergeCalls,
    corpus.calls.map((call) => ({
      callerId: call.callerId,
      calleeId: call.calleeId,
      order: call.order,
      line: call.line,
      insideHeaderOverride: call.insideHeaderOverride ? 1 : 0,
    })),
  );
  await graph.write(mergeFlow);
}

export async function loadCorpus(graph: GraphSession, corpus: Corpus): Promise<void> {
  const sink = corpus.functions.find((fn) => fn.id === SINK_ID);
  const sanitizer = corpus.functions.find((fn) => fn.id === SANITIZER_ID);
  const upload = corpus.functions.find((fn) => fn.id === UPLOAD_ID);
  const rename = corpus.externals.find((external) => external.id === RENAME_ID);
  if (!sink || !sanitizer || !upload || !rename) {
    throw new Error("extract JSON is missing the store_file, safe_path_join, upload, or set_file_name nodes");
  }
  if (!sink.file.endsWith("paste.rs") || !sanitizer.file.endsWith("util.rs")) {
    throw new Error("SINKS and SANITIZES only point at functions the fix diff touches");
  }
  const flag = corpus.config.flags.find((item) => item.table === "server" && item.key === "auth_tokens");
  if (!flag || flag.assigned || !corpus.build.pushesImage) {
    throw new Error("shipped config.toml or docker.yml does not match the v0.18.0 facts");
  }

  await loadCallGraph(graph, corpus);
  await graph.write(mergeAdvisory, {
    title: ADVISORY_TITLE,
    sinkId: SINK_ID,
    sanId: SANITIZER_ID,
  });
  await graph.write(mergeEnables, { line: flag.line, uploadId: UPLOAD_ID });
  await graph.write(mergeShips, { sinkId: SINK_ID });
}

async function ignoreExists(run: () => Promise<unknown>) {
  try {
    await run();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!/exist/i.test(message)) throw error;
  }
}

async function batches(graph: GraphSession, query: string, rows: Record<string, unknown>[]) {
  const size = 200;
  for (let index = 0; index < rows.length; index += size) {
    await graph.write(query, { rows: rows.slice(index, index + size) });
  }
}
