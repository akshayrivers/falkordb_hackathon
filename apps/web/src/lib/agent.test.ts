import { describe, expect, it } from "vitest";

import { investigate, parseIntent } from "@/lib/agent";
import { SINK_ID } from "@/lib/model";
import { MCP_TOOLS } from "@/lib/mcp";
import { defaultReasoning } from "@/lib/names";
import { act, writeFindings, writeStep } from "@/lib/queries";

const allowed = ["store_file", "safe_path_join", "set_file_name", "store_url", "upload"];

function fakeGraph(options?: { reached?: string[]; uncovered?: boolean }) {
  const writes: Array<{ query: string; params?: Record<string, unknown> }> = [];
  const reads: string[] = [];
  const reached = options?.reached ?? allowed;
  const showUncovered = options?.uncovered !== false;
  return {
    writes,
    reads,
    graph: {
      name: "fake",
      read: async (query: string) => {
        reads.push(query);
        if (query.includes("algo.bfs")) {
          return { data: reached.map((name) => ({ name })) };
        }
        if (query.includes("algo.SPpaths")) return { data: [{ pathWeight: 2 }] };
        if (query.includes("bad IS NULL")) {
          return {
            data: [
              {
                id: "src/paste.rs::Paste::store_url",
                qual: "Paste::store_url",
                name: "store_url",
                guardLine: 346,
                guardOrder: 10,
              },
            ],
          };
        }
        if (query.includes("ORDER BY")) {
          return {
            data: [
              { id: "external::safe_path_join", name: "safe_path_join", order: 28, line: 180, insideHeaderOverride: 0 },
              { id: "external::set_file_name", name: "set_file_name", order: 41, line: 214, insideHeaderOverride: 1 },
            ],
          };
        }
        if (query.includes("insideHeaderOverride")) {
          if (!showUncovered) return { data: [] };
          return {
            data: [
              {
                id: SINK_ID,
                qual: "Paste::store_file",
                name: "store_file",
                sinkCall: "set_file_name",
                sinkLine: 214,
                sinkOrder: 41,
                guardOrder: 28,
                guardLine: 180,
              },
            ],
          };
        }
        if (query.includes("issue-622")) {
          return {
            data: [
              {
                sinkQual: "Paste::store_file",
                sanQual: "safe_path_join",
                flagKey: "auth_tokens",
                flagTable: "server",
                flagAssigned: false,
                flagLine: 13,
                entryName: "upload",
                buildFile: ".github/workflows/docker.yml",
                shippedQual: "Paste::store_file",
              },
            ],
          };
        }
        return { data: [] };
      },
      write: async (query: string, params?: Record<string, unknown>) => {
        writes.push({ query, params });
        if (query.includes("Finding")) {
          const rows = (params?.rows as Array<{ kind: string }> | undefined) ?? [];
          return { data: rows.map((row) => ({ kind: row.kind, role: row.kind })) };
        }
        return { data: [{ stepId: "step-1", kind: "guard", targetId: SINK_ID, role: "uncovered" }] };
      },
      constraintOnFunctionId: async () => {},
      deleteGraph: async () => {},
      close: async () => {},
    },
  };
}

describe("investigator and clerk", () => {
  it("exposes walk, locate, trace, cover, and act", () => {
    expect([...MCP_TOOLS]).toEqual(["walk", "locate", "trace", "cover", "act"]);
  });

  it("rejects an intent outside triage, walkthrough, and both", () => {
    expect(() => parseIntent("shell")).toThrow(/intent/);
  });

  it("triage runs locate, cover, and trace, then stores guard when the walk reaches the rename", async () => {
    const { graph, writes, reads } = fakeGraph();
    const result = await investigate(graph, { intent: "triage", depth: 3 }, {
      draft: async () => ({ text: defaultReasoning(new Set(allowed)), usedModel: false }),
    });
    expect(result.tools).toEqual(["locate", "trace", "cover", "act"]);
    expect(result.skipped).toEqual(["walk"]);
    expect(result.decision).toBe("guard");
    expect(result.usedModel).toBe(false);
    expect(result.findings).toEqual(["uncovered", "covered", "config", "build"]);
    expect(writes.map((write) => write.query)).toEqual([writeStep, act, writeFindings]);
    expect(reads.some((query) => query.includes("issue-622"))).toBe(true);
    expect(reads.some((query) => query.includes("insideHeaderOverride"))).toBe(true);
    expect(reads.some((query) => query.includes("ORDER BY"))).toBe(false);
    const stored = writes.map((write) => JSON.stringify(write.params));
    expect(stored.join("\n")).toContain("`store_file`");
    expect(stored.join("\n")).not.toContain("not_a_function");
  });

  it("replaces a clerk sentence that names a stranger before any write", async () => {
    const { graph, writes } = fakeGraph();
    const result = await investigate(graph, { intent: "both", depth: 3 }, {
      draft: async () => ({ text: "See `not_a_function`.", usedModel: true }),
    });
    expect(result.reasoning).toBe(defaultReasoning(new Set(result.names)));
    expect(result.reasoning).not.toContain("not_a_function");
    expect(result.usedModel).toBe(false);
    expect(writes.length).toBeGreaterThan(0);
    expect(JSON.stringify(writes)).not.toContain("not_a_function");
  });

  it("walkthrough records the step and does not decide", async () => {
    const { graph, writes } = fakeGraph();
    const result = await investigate(graph, { intent: "walkthrough", depth: 3 }, {
      draft: async () => ({ text: defaultReasoning(new Set(allowed)), usedModel: false }),
    });
    expect(result.tools).toEqual(["locate", "trace", "walk"]);
    expect(result.skipped).toEqual(["cover", "act"]);
    expect(result.decision).toBe("");
    expect(writes.map((write) => write.query)).toEqual([writeStep, writeFindings]);
    expect(writes.some((write) => write.query === act)).toBe(false);
  });

  it("does not call act when the walk misses set_file_name", async () => {
    const { graph, writes } = fakeGraph({ reached: allowed.filter((name) => name !== "set_file_name") });
    const result = await investigate(graph, { intent: "triage", depth: 1 }, {
      draft: async () => ({ text: defaultReasoning(new Set(allowed)), usedModel: true }),
    });
    expect(result.tools).toEqual(["locate", "trace"]);
    expect(result.skipped).toEqual(["cover", "act"]);
    expect(result.decision).toBe("");
    expect(result.usedModel).toBe(false);
    expect(result.reasoning).toContain("No guard is stored");
    expect(writes.map((write) => write.query)).toEqual([writeStep, writeFindings]);
    expect(writes.some((write) => write.query === act)).toBe(false);
  });

  it("does not guard again when cover returns no uncovered row", async () => {
    const { graph, writes } = fakeGraph({ uncovered: false });
    const result = await investigate(graph, { intent: "triage", depth: 3 }, {
      draft: async () => ({ text: defaultReasoning(new Set(allowed)), usedModel: true }),
    });
    expect(result.tools).toEqual(["locate", "trace", "cover"]);
    expect(result.skipped).toEqual(["act", "walk"]);
    expect(result.decision).toBe("");
    expect(result.usedModel).toBe(false);
    expect(result.reasoning).toContain("already has a guard");
    expect(writes.some((write) => write.query === act)).toBe(false);
  });
});
