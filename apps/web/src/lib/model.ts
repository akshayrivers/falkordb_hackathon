export const GRAPH_NAME = "sever";
export const TENANT = "rustypaste";
export const DEFAULT_DEPTH = 3;

export const SINK_ID = "src/paste.rs::Paste::store_file";
export const SANITIZER_ID = "src/util.rs::safe_path_join";
export const UPLOAD_ID = "src/server.rs::upload";
export const RENAME_ID = "external::set_file_name";

export const DECISIONS = ["guard", "dismiss", "escalate"] as const;
export type Decision = (typeof DECISIONS)[number];

export const INTENTS = ["triage", "walkthrough", "both"] as const;
export type Intent = (typeof INTENTS)[number];

export const CONFIG_FLAG_ID = "server.auth_tokens";
export const BUILD_ID = "docker-yml";

export type Corpus = {
  repo: string;
  tag: string;
  functions: FunctionRow[];
  calls: CallRow[];
  externals: ExternalRow[];
  config: {
    file: string;
    flags: Array<{
      table: string;
      key: string;
      assigned: boolean;
      line: number;
    }>;
  };
  build: {
    workflow: string;
    dockerfile: string;
    pushesImage: boolean;
  };
};

export type FunctionRow = {
  id: string;
  name: string;
  qual: string;
  file: string;
  line: number;
  headerOverrideLine: number | null;
};

export type CallRow = {
  callerId: string;
  calleeId: string;
  calleeName: string;
  order: number;
  line: number;
  insideHeaderOverride: boolean;
};

export type ExternalRow = {
  id: string;
  name: string;
  path: string;
};

export type BodyCall = {
  id: string;
  name: string;
  order: number;
  line: number;
  insideHeaderOverride: boolean;
};

export type ReachCall = {
  sourceId: string;
  sourceName: string;
  id: string;
  name: string;
  order: number;
  line: number;
};

export type LastDecision = {
  kind: string;
  qual: string;
  reasoning: string;
};

export type Survey = {
  graph: boolean;
  depth: number;
  covered: Array<{ qual: string; guardLine: number; guardOrder: number }>;
  uncovered: Array<{
    qual: string;
    sinkLine: number;
    sinkOrder: number;
    guardOrder: number;
    guardLine: number;
  }>;
  config: {
    key: string;
    table: string;
    assigned: boolean;
    line: number;
    enables: string;
  } | null;
  build: { file: string; ships: string } | null;
  body: BodyCall[];
  reach: ReachCall[];
  reached: string[];
  shortestHops: number | null;
  maxFlow: number | null;
  names: string[];
  reasoning: string;
  actEnabled: boolean;
  caseId: string;
  caseLabel: string;
  verdict: boolean;
  functions: Array<{ id: string; name: string; qual: string; file: string; line: number }>;
  selectedId: string | null;
  reachedSink: boolean;
  lastDecision: LastDecision | null;
  guarded: boolean;
};
