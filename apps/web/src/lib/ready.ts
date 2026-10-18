import type { GraphSession } from "@/lib/graph";
import { loadCorpus, readCorpus } from "@/lib/load";
import { mergeFlow } from "@/lib/queries";
import { cellNumber, rowsOf } from "@/lib/rows";

let pending: Promise<void> | null = null;

export function ensureLoaded(graph: GraphSession): Promise<void> {
  if (pending) return pending;
  pending = loadIfEmpty(graph).catch((error: unknown) => {
    pending = null;
    throw error;
  });
  return pending;
}

async function loadIfEmpty(graph: GraphSession) {
  try {
    const existing = await graph.read("MATCH (a:Advisory {id: 'issue-622'}) RETURN a.id AS id");
    if (rowsOf(existing).length > 0) {
      const flow = await graph.read("MATCH ()-[f:FLOW]->() WHERE f.capacity >= 0 RETURN count(f) AS edges");
      if ((cellNumber(rowsOf(flow)[0]?.edges) ?? 0) > 0) return;
      await graph.write(mergeFlow);
      return;
    }
  } catch {
    // The graph is created by the first write.
  }
  await loadCorpus(graph, await readCorpus());
}
