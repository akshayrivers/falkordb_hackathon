import { Annotation, END, START, StateGraph } from "@langchain/langgraph";

import type { GraphSession } from "@/lib/graph";
import { draftWithGemini, geminiKey } from "@/lib/gemini";
import {
  BUILD_ID,
  CONFIG_FLAG_ID,
  INTENTS,
  SINK_ID,
  TENANT,
  type Intent,
} from "@/lib/model";
import {
  alreadyGuardedReasoning,
  assertNamesFromPayload,
  defaultReasoning,
  stoppedReasoning,
  StrangerNameError,
} from "@/lib/names";
import { callSeverTool } from "@/lib/mcp";
import { writeFindings, writeStep } from "@/lib/queries";
import { rowsOf } from "@/lib/rows";
import { clampDepth, type CoverFacts, type LocateFacts, type TraceFacts, type WalkFacts } from "@/lib/tools";

export type InvestigationResult = {
  intent: Intent;
  depth: number;
  tools: string[];
  skipped: string[];
  names: string[];
  reasoning: string;
  decision: string;
  stepId: string;
  runId: string;
  findings: string[];
  usedModel: boolean;
};

type Draft = (names: ReadonlySet<string>) => Promise<{ text: string; usedModel: boolean }>;

const State = Annotation.Root({
  intent: Annotation<Intent>,
  depth: Annotation<number>,
  names: Annotation<string[]>({ reducer: (_left, right) => right, default: () => [] }),
  tools: Annotation<string[]>({ reducer: (_left, right) => right, default: () => [] }),
  skipped: Annotation<string[]>({ reducer: (_left, right) => right, default: () => [] }),
  reasoning: Annotation<string>({ reducer: (_left, right) => right, default: () => "" }),
  decision: Annotation<string>({ reducer: (_left, right) => right, default: () => "" }),
  stepId: Annotation<string>({ reducer: (_left, right) => right, default: () => "" }),
  runId: Annotation<string>({ reducer: (_left, right) => right, default: () => "" }),
  findings: Annotation<string[]>({ reducer: (_left, right) => right, default: () => [] }),
  usedModel: Annotation<boolean>({ reducer: (_left, right) => right, default: () => false }),
  coveredId: Annotation<string>({ reducer: (_left, right) => right, default: () => "" }),
  uncoveredId: Annotation<string>({ reducer: (_left, right) => right, default: () => "" }),
  coveredDetail: Annotation<string>({ reducer: (_left, right) => right, default: () => "" }),
  uncoveredDetail: Annotation<string>({ reducer: (_left, right) => right, default: () => "" }),
  configDetail: Annotation<string>({ reducer: (_left, right) => right, default: () => "" }),
  buildDetail: Annotation<string>({ reducer: (_left, right) => right, default: () => "" }),
  sinkReached: Annotation<boolean>({ reducer: (_left, right) => right, default: () => false }),
  uncoveredOpen: Annotation<boolean>({ reducer: (_left, right) => right, default: () => false }),
});

export function parseIntent(value: string): Intent {
  if (INTENTS.includes(value as Intent)) return value as Intent;
  throw new Error("intent must be triage, walkthrough, or both");
}

export async function investigate(
  graph: GraphSession,
  input: { intent: string; depth?: number },
  options?: { draft?: Draft },
): Promise<InvestigationResult> {
  const intent = parseIntent(input.intent);
  const depth = clampDepth(input.depth ?? 3);
  const draft = options?.draft ?? draftClerk;
  const compiled = new StateGraph(State)
    .addNode("investigator", (state) => investigateNode(graph, state))
    .addNode("clerk", (state) => clerkNode(graph, state, draft))
    .addEdge(START, "investigator")
    .addEdge("investigator", "clerk")
    .addEdge("clerk", END)
    .compile();
  const result = await compiled.invoke({ intent, depth });
  return {
    intent,
    depth,
    tools: result.tools,
    skipped: result.skipped,
    names: result.names,
    reasoning: result.reasoning,
    decision: result.decision,
    stepId: result.stepId,
    runId: result.runId,
    findings: result.findings,
    usedModel: result.usedModel,
  };
}

async function investigateNode(
  graph: GraphSession,
  state: typeof State.State,
): Promise<Partial<typeof State.State>> {
  const tools: string[] = [];
  const skipped: string[] = [];
  const names = new Set<string>();
  const located = (await callSeverTool(graph, "locate", {})) as LocateFacts;
  tools.push("locate");
  for (const name of located.names) names.add(name);
  const trace = (await callSeverTool(graph, "trace", { depth: state.depth })) as TraceFacts;
  tools.push("trace");
  for (const name of trace.names) names.add(name);
  const sinkReached = trace.reached.includes("set_file_name");
  let coveredId = "";
  let uncoveredId = "";
  let coveredDetail = "";
  let uncoveredDetail = "";
  let uncoveredOpen = false;
  if (!sinkReached) {
    if (state.intent === "triage" || state.intent === "both") skipped.push("cover");
    if (state.intent === "walkthrough" || state.intent === "both") skipped.push("walk");
    if (state.intent !== "walkthrough") skipped.push("act");
  } else {
    if (state.intent === "triage" || state.intent === "both") {
      const cover = (await callSeverTool(graph, "cover", {})) as CoverFacts;
      tools.push("cover");
      for (const name of cover.names) names.add(name);
      const uncovered = cover.uncovered[0];
      const covered = cover.covered.find((row) => row.qual.includes("store_url")) ?? cover.covered[0];
      if (uncovered) {
        uncoveredOpen = true;
        uncoveredId = uncovered.id || SINK_ID;
        uncoveredDetail = `${uncovered.qual} set_file_name order ${uncovered.sinkOrder} line ${uncovered.sinkLine}`;
      }
      if (covered) {
        coveredId = covered.id;
        coveredDetail = `${covered.qual} safe_path_join line ${covered.guardLine}`;
      }
      if (!uncoveredOpen) skipped.push("act");
    } else {
      skipped.push("cover", "act");
    }
    if (state.intent === "walkthrough" || state.intent === "both") {
      const walk = (await callSeverTool(graph, "walk", { depth: state.depth })) as WalkFacts;
      tools.push("walk");
      for (const name of walk.names) names.add(name);
    } else {
      skipped.push("walk");
    }
  }
  const config = located.config;
  const build = located.build;
  return {
    tools,
    skipped,
    names: [...names].sort(),
    coveredId,
    uncoveredId,
    coveredDetail,
    uncoveredDetail,
    configDetail: config
      ? `${config.table}.${config.key} assigned=${config.assigned} line ${config.line} enables ${config.enables}`
      : "",
    buildDetail: build ? `${build.file} ships ${build.ships}` : "",
    sinkReached,
    uncoveredOpen,
  };
}

async function clerkNode(
  graph: GraphSession,
  state: typeof State.State,
  draft: Draft,
): Promise<Partial<typeof State.State>> {
  const allowed = new Set(state.names);
  const hold = state.intent !== "walkthrough" && (!state.sinkReached || !state.uncoveredOpen);
  let text: string;
  let usedModel = false;
  if (hold) {
    text = !state.sinkReached ? stoppedReasoning(allowed) : alreadyGuardedReasoning(allowed);
  } else {
    const drafted = await acceptDraft(draft, allowed);
    text = drafted.text;
    usedModel = drafted.usedModel;
  }
  let decision = "";
  let runId = crypto.randomUUID();
  let stepId = crypto.randomUUID();
  let tools = state.tools;
  if (state.intent === "walkthrough" || hold) {
    await graph.write(writeStep, {
      runId,
      tenant: TENANT,
      stepId,
      reasoning: text,
      targetId: state.uncoveredId || SINK_ID,
      intent: state.intent,
      at: Date.now(),
    });
  } else {
    const acted = (await callSeverTool(graph, "act", {
      decision: "guard",
      reasoning: text,
      allowed,
      intent: state.intent,
      depth: state.depth,
    })) as { kind: string; runId: string; stepId: string };
    decision = acted.kind;
    runId = acted.runId;
    stepId = acted.stepId;
    tools = [...state.tools, "act"];
  }
  const rows = findingRows(runId, state);
  const written = rows.length
    ? rowsOf(await graph.write(writeFindings, { runId, tenant: TENANT, rows }))
    : [];
  return {
    tools,
    reasoning: text,
    decision,
    stepId,
    runId,
    usedModel,
    findings: written.map((row) => String(row.kind ?? "")).filter(Boolean),
  };
}

async function acceptDraft(draft: Draft, allowed: ReadonlySet<string>) {
  try {
    const drafted = await draft(allowed);
    assertNamesFromPayload(drafted.text, allowed);
    return drafted;
  } catch (error) {
    if (!(error instanceof StrangerNameError)) throw error;
    const text = defaultReasoning(allowed);
    assertNamesFromPayload(text, allowed);
    return { text, usedModel: false };
  }
}

function findingRows(runId: string, state: typeof State.State) {
  const rows: Array<{ id: string; kind: string; detail: string; targetId: string }> = [];
  if (state.uncoveredId) {
    rows.push({
      id: `${runId}:uncovered`,
      kind: "uncovered",
      detail: state.uncoveredDetail,
      targetId: state.uncoveredId,
    });
  }
  if (state.coveredId) {
    rows.push({
      id: `${runId}:covered`,
      kind: "covered",
      detail: state.coveredDetail,
      targetId: state.coveredId,
    });
  }
  if (state.configDetail) {
    rows.push({
      id: `${runId}:config`,
      kind: "config",
      detail: state.configDetail,
      targetId: CONFIG_FLAG_ID,
    });
  }
  if (state.buildDetail) {
    rows.push({
      id: `${runId}:build`,
      kind: "build",
      detail: state.buildDetail,
      targetId: BUILD_ID,
    });
  }
  return rows;
}

async function draftClerk(names: ReadonlySet<string>): Promise<{ text: string; usedModel: boolean }> {
  const fallback = defaultReasoning(names);
  if (!geminiKey()) return { text: fallback, usedModel: false };
  const list = [...names].sort().join(", ");
  try {
    const text = await draftWithGemini(
      `Write one sentence. Wrap every function name in backticks. Use only names from this list: ${list}. Say that store_file calls safe_path_join and then set_file_name, and that store_url is covered. Do not write Cypher. Do not mention any name outside the list.`,
    );
    assertNamesFromPayload(text, names);
    return { text, usedModel: true };
  } catch {
    return { text: fallback, usedModel: false };
  }
}
