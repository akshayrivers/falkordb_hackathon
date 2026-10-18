import { GRAPH_NAME } from "@/lib/model";
import { StrangerNameError } from "@/lib/names";
import { clampDepth, commitAct, readSurvey } from "@/lib/tools";

type ActBody = {
  decision?: string;
  reasoning?: string;
  stepId?: string;
  runId?: string;
  depth?: number;
};

export async function POST(request: Request) {
  let body: ActBody;
  try {
    body = (await request.json()) as ActBody;
  } catch {
    return Response.json({ error: "expected JSON" }, { status: 400 });
  }
  try {
    const { useGraph } = await import("@/lib/graph");
    const { ensureLoaded } = await import("@/lib/ready");
    const graph = await useGraph(GRAPH_NAME);
    await ensureLoaded(graph);
    const survey = await readSurvey(graph, clampDepth(body.depth ?? 3));
    const result = await commitAct(graph, {
      decision: body.decision ?? "",
      reasoning: body.reasoning ?? "",
      allowed: new Set(survey.names),
      stepId: body.stepId,
      runId: body.runId,
    });
    return Response.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "act failed";
    const status =
      error instanceof StrangerNameError || message.startsWith("decision") ? 400 : 500;
    return Response.json({ error: message }, { status });
  }
}
