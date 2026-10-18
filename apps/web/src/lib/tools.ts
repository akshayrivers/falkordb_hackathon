import type { CaseRecord } from "@/lib/cases";
import type { GraphSession } from "@/lib/graph";
import {
  DECISIONS,
  DEFAULT_DEPTH,
  RENAME_ID,
  SINK_ID,
  TENANT,
  UPLOAD_ID,
  type Corpus,
  type Decision,
  type LastDecision,
  type Survey,
} from "@/lib/model";
import { assertNamesFromPayload, defaultReasoning } from "@/lib/names";
import {
  act,
  bodyCalls,
  bfs,
  coverCovered,
  coverUncovered,
  guardMark,
  latestStep,
  listFunctions,
  locate,
  maxFlow,
  reachCalls,
  shortest,
  writeStep,
} from "@/lib/queries";
import { cellBool, cellNumber, cellString, rowsOf } from "@/lib/rows";

type Reader = Pick<GraphSession, "read">;

function keepName(names: Set<string>, value: unknown) {
  const text = cellString(value).trim();
  if (text.length > 0) names.add(text);
}

export type LocateFacts = {
  config: NonNullable<Survey["config"]>;
  build: NonNullable<Survey["build"]>;
  names: string[];
};

export async function runLocate(graph: Reader): Promise<LocateFacts> {
  const place = rowsOf(await graph.read(locate))[0];
  if (!place) throw new Error("locate returned no advisory");
  const names = new Set<string>();
  keepName(names, place.entryName);
  keepName(names, place.sanQual);
  keepName(names, place.sinkQual);
  return {
    config: {
      key: cellString(place.flagKey),
      table: cellString(place.flagTable),
      assigned: cellBool(place.flagAssigned),
      line: cellNumber(place.flagLine) ?? 0,
      enables: cellString(place.entryName),
    },
    build: {
      file: cellString(place.buildFile),
      ships: cellString(place.shippedQual),
    },
    names: [...names],
  };
}

export type CoverFacts = {
  covered: Array<Survey["covered"][number] & { id: string }>;
  uncovered: Array<Survey["uncovered"][number] & { id: string }>;
  names: string[];
};

export async function runCover(graph: Reader): Promise<CoverFacts> {
  const [uncovered, covered] = await Promise.all([
    graph.read(coverUncovered),
    graph.read(coverCovered),
  ]);
  const names = new Set<string>();
  for (const row of rowsOf(uncovered)) {
    keepName(names, row.name);
    keepName(names, row.qual);
    keepName(names, row.sinkCall);
  }
  for (const row of rowsOf(covered)) {
    keepName(names, row.name);
    keepName(names, row.qual);
  }
  return {
    covered: rowsOf(covered).map((row) => ({
      id: cellString(row.id),
      qual: cellString(row.qual),
      guardLine: cellNumber(row.guardLine) ?? 0,
      guardOrder: cellNumber(row.guardOrder) ?? 0,
    })),
    uncovered: rowsOf(uncovered).map((row) => ({
      id: cellString(row.id),
      qual: cellString(row.qual),
      sinkLine: cellNumber(row.sinkLine) ?? 0,
      sinkOrder: cellNumber(row.sinkOrder) ?? 0,
      guardOrder: cellNumber(row.guardOrder) ?? 0,
      guardLine: cellNumber(row.guardLine) ?? 0,
    })),
    names: [...names],
  };
}

export type TraceFacts = {
  reached: string[];
  shortestHops: number | null;
  names: string[];
};

export async function runTrace(graph: Reader, depth = DEFAULT_DEPTH): Promise<TraceFacts> {
  const bounded = clampDepth(depth);
  const [reached, hops] = await Promise.all([
    graph.read(bfs, { startId: UPLOAD_ID, depth: bounded }),
    readShortest(graph, bounded),
  ]);
  const names = new Set<string>();
  const list = rowsOf(reached).map((row) => cellString(row.name)).filter(Boolean);
  for (const name of list) names.add(name);
  return {
    reached: list,
    shortestHops: cellNumber(rowsOf(hops)[0]?.pathWeight),
    names: [...names],
  };
}

export type WalkFacts = {
  body: Survey["body"];
  names: string[];
};

export async function runWalk(graph: Reader, depth = DEFAULT_DEPTH): Promise<WalkFacts> {
  const bounded = clampDepth(depth);
  if (bounded < 2) return { body: [], names: [] };
  const body = rowsOf(await graph.read(bodyCalls, { id: SINK_ID })).map((row) => ({
    id: cellString(row.id),
    name: cellString(row.name),
    order: cellNumber(row.order) ?? 0,
    line: cellNumber(row.line) ?? 0,
    insideHeaderOverride: cellBool(row.insideHeaderOverride),
  }));
  return { body, names: body.map((call) => call.name).filter(Boolean) };
}

function lastDecisionFrom(rows: ReturnType<typeof rowsOf>): LastDecision | null {
  const row = rows[0];
  if (!row) return null;
  const kind = cellString(row.kind) || cellString(row.decision);
  const qual = cellString(row.qual);
  const reasoning = cellString(row.reasoning);
  if (!kind && !qual && !reasoning) return null;
  return { kind, qual, reasoning };
}

function surveyReasoning(names: Set<string>): string {
  try {
    return defaultReasoning(names);
  } catch {
    return "";
  }
}

export function hiddenSurvey(depth = DEFAULT_DEPTH): Survey {
  return {
    graph: false,
    depth,
    covered: [],
    uncovered: [],
    config: null,
    build: null,
    body: [],
    reach: [],
    reached: [],
    shortestHops: null,
    maxFlow: null,
    names: [],
    reasoning: "",
    actEnabled: false,
    caseId: "rustypaste",
    caseLabel: "rustypaste v0.18.0",
    verdict: true,
    functions: [],
    selectedId: null,
    reachedSink: false,
    lastDecision: null,
    guarded: false,
  };
}

export async function readSurvey(graph: GraphSession, depth = DEFAULT_DEPTH): Promise<Survey> {
  const bounded = clampDepth(depth);
  const [located, cover, trace, walk, flow, last, marked] = await Promise.all([
    runLocate(graph),
    runCover(graph),
    runTrace(graph, bounded),
    runWalk(graph, bounded),
    graph.read(maxFlow, { startId: UPLOAD_ID, sinkId: RENAME_ID }),
    graph.read(latestStep, { tenant: TENANT }),
    graph.read(guardMark, { id: SINK_ID }),
  ]);
  const names = new Set<string>([...located.names, ...cover.names, ...trace.names, ...walk.names]);
  return {
    graph: true,
    depth: bounded,
    covered: cover.covered.map(({ qual, guardLine, guardOrder }) => ({ qual, guardLine, guardOrder })),
    uncovered: cover.uncovered.map(({ qual, sinkLine, sinkOrder, guardOrder, guardLine }) => ({
      qual,
      sinkLine,
      sinkOrder,
      guardOrder,
      guardLine,
    })),
    config: located.config,
    build: located.build,
    body: walk.body,
    reach: [],
    reached: trace.reached,
    shortestHops: trace.shortestHops,
    maxFlow: cellNumber(rowsOf(flow)[0]?.maxFlow),
    names: [...names].sort(),
    reasoning: surveyReasoning(names),
    actEnabled: true,
    caseId: "rustypaste",
    caseLabel: "rustypaste v0.18.0",
    verdict: true,
    functions: [],
    selectedId: null,
    reachedSink: trace.reached.includes("set_file_name"),
    lastDecision: lastDecisionFrom(rowsOf(last)),
    guarded: cellString(rowsOf(marked)[0]?.kind) === "guard",
  };
}

export async function commitAct(
  graph: Pick<GraphSession, "write">,
  input: {
    decision: string;
    reasoning: string;
    allowed: ReadonlySet<string>;
    stepId?: string;
    runId?: string;
    intent?: string;
  },
): Promise<{ stepId: string; runId: string; kind: Decision; targetId: string }> {
  if (!DECISIONS.includes(input.decision as Decision)) {
    throw new Error("decision must be guard, dismiss, or escalate");
  }
  assertNamesFromPayload(input.reasoning, input.allowed);
  const decision = input.decision as Decision;
  const runId = input.runId ?? crypto.randomUUID();
  let stepId = input.stepId;
  if (!stepId) {
    stepId = crypto.randomUUID();
    await graph.write(writeStep, {
      runId,
      tenant: "rustypaste",
      stepId,
      reasoning: input.reasoning,
      targetId: SINK_ID,
      intent: input.intent ?? "triage",
      at: Date.now(),
    });
  }
  const written = await graph.write(act, {
    runId,
    tenant: "rustypaste",
    stepId,
    decision,
    reasoning: input.reasoning,
  });
  const row = rowsOf(written)[0];
  return {
    stepId,
    runId,
    kind: decision,
    targetId: cellString(row?.targetId),
  };
}

async function readShortest(graph: Pick<GraphSession, "read">, depth: number) {
  try {
    return await graph.read(shortest, { startId: UPLOAD_ID, sinkId: RENAME_ID, depth });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (depth < 2 || /path/i.test(message)) return { data: [] };
    throw error;
  }
}

export async function readRepoSurvey(
  graph: GraphSession,
  depth: number,
  corpus: Corpus,
  item: CaseRecord,
  selectedId?: string,
): Promise<Survey> {
  const bounded = clampDepth(depth);
  const [listed, cover] = await Promise.all([
    graph.read(listFunctions, { repo: corpus.repo }),
    runCover(graph),
  ]);
  const functions = rowsOf(listed).map((row) => ({
    id: cellString(row.id),
    name: cellString(row.name),
    qual: cellString(row.qual),
    file: cellString(row.file),
    line: cellNumber(row.line) ?? 0,
  }));
  const selected =
    functions.find((fn) => fn.id === selectedId) ??
    functions.find((fn) => fn.name === "main") ??
    functions[0];
  const body = selected
    ? rowsOf(await graph.read(bodyCalls, { id: selected.id })).map((row) => ({
        id: cellString(row.id),
        name: cellString(row.name),
        order: cellNumber(row.order) ?? 0,
        line: cellNumber(row.line) ?? 0,
        insideHeaderOverride: cellBool(row.insideHeaderOverride),
      }))
    : [];
  let reached: string[] = [];
  let reach: Survey["reach"] = [];
  if (selected) {
    const traced = rowsOf(await graph.read(bfs, { startId: selected.id, depth: bounded }));
    reached = traced.map((row) => cellString(row.name)).filter(Boolean);
    if (bounded >= 2) {
      reach = rowsOf(await graph.read(reachCalls, { id: selected.id })).map((row) => ({
        sourceId: cellString(row.sourceId),
        sourceName: cellString(row.sourceName),
        id: cellString(row.id),
        name: cellString(row.name),
        order: cellNumber(row.order) ?? 0,
        line: cellNumber(row.line) ?? 0,
      }));
    }
  }
  const names = new Set<string>([...cover.names, ...body.map((call) => call.name), ...reached]);
  if (selected) names.add(selected.name);
  return {
    graph: true,
    depth: bounded,
    covered: cover.covered.map(({ qual, guardLine, guardOrder }) => ({ qual, guardLine, guardOrder })),
    uncovered: cover.uncovered.map(({ qual, sinkLine, sinkOrder, guardOrder, guardLine }) => ({
      qual,
      sinkLine,
      sinkOrder,
      guardOrder,
      guardLine,
    })),
    config: null,
    build: null,
    body,
    reach,
    reached,
    shortestHops: null,
    maxFlow: null,
    names: [...names].filter(Boolean).sort(),
    reasoning: "",
    actEnabled: false,
    caseId: item.id,
    caseLabel: item.label,
    verdict: false,
    functions,
    selectedId: selected?.id ?? null,
    reachedSink: false,
    lastDecision: null,
    guarded: false,
  };
}

export function clampDepth(depth: number): number {
  if (!Number.isFinite(depth)) return DEFAULT_DEPTH;
  return Math.min(6, Math.max(1, Math.trunc(depth)));
}
