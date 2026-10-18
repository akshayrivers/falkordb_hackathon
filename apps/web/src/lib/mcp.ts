import type { GraphSession } from "@/lib/graph";
import { clampDepth, commitAct, readSurvey, runCover, runLocate, runTrace, runWalk } from "@/lib/tools";

export const MCP_TOOLS = ["walk", "locate", "trace", "cover", "act"] as const;
export type McpToolName = (typeof MCP_TOOLS)[number];

export async function callSeverTool(
  graph: GraphSession,
  name: McpToolName,
  args: {
    depth?: number;
    decision?: string;
    reasoning?: string;
    stepId?: string;
    runId?: string;
    intent?: string;
    allowed?: ReadonlySet<string>;
  },
): Promise<unknown> {
  const depth = clampDepth(args.depth ?? 3);
  if (name === "walk") return runWalk(graph, depth);
  if (name === "locate") return runLocate(graph);
  if (name === "trace") return runTrace(graph, depth);
  if (name === "cover") return runCover(graph);
  const allowed = args.allowed ?? new Set((await readSurvey(graph, depth)).names);
  return commitAct(graph, {
    decision: args.decision ?? "",
    reasoning: args.reasoning ?? "",
    allowed,
    stepId: args.stepId,
    runId: args.runId,
    intent: args.intent,
  });
}
