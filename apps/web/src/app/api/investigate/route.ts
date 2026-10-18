import { GRAPH_NAME, INTENTS } from "@/lib/model";

export async function POST(request: Request) {
  let body: { intent?: string; depth?: number };
  try {
    body = (await request.json()) as { intent?: string; depth?: number };
  } catch {
    return Response.json({ error: "expected JSON" }, { status: 400 });
  }
  if (!INTENTS.includes(body.intent as (typeof INTENTS)[number])) {
    return Response.json({ error: "intent must be triage, walkthrough, or both" }, { status: 400 });
  }
  try {
    const { useGraph } = await import("@/lib/graph");
    const { ensureLoaded } = await import("@/lib/ready");
    const { investigate } = await import("@/lib/agent");
    const graph = await useGraph(GRAPH_NAME);
    await ensureLoaded(graph);
    const result = await investigate(graph, { intent: body.intent ?? "", depth: body.depth });
    return Response.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "investigate failed";
    const status = message.startsWith("intent") || message.startsWith("stranger") ? 400 : 500;
    return Response.json({ error: message }, { status });
  }
}
