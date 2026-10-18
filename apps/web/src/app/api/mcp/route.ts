import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { z } from "zod";

import { GRAPH_NAME } from "@/lib/model";
import { MCP_TOOLS, callSeverTool, type McpToolName } from "@/lib/mcp";

const depthField = z.number().int().min(1).max(6).optional();

const descriptions: Record<McpToolName, string> = {
  locate: "Call this first. The advisory, the sanitizer, the unassigned auth_tokens flag, and the workflow that ships the binary.",
  trace: "Call after locate. BFS and the shortest CALLS path from upload to set_file_name. If set_file_name is absent, stop. Do not call cover, walk, or act.",
  cover: "Call only after trace reached set_file_name. Bodies where the header rename is after safe_path_join, and bodies where safe_path_join is after the header binding.",
  walk: "Call for a walkthrough, after trace reached set_file_name. Ordered calls in the Paste::store_file body. Depth below 2 returns an empty body.",
  act: "Call only after cover returns an uncovered row. One statement: guard, dismiss, or escalate. Backtick names must already be in the tool payload.",
};

async function openLoaded() {
  const { useGraph } = await import("@/lib/graph");
  const { ensureLoaded } = await import("@/lib/ready");
  const graph = await useGraph(GRAPH_NAME);
  await ensureLoaded(graph);
  return graph;
}

function severServer() {
  const server = new McpServer({ name: "sever", version: "0.1.0" });
  for (const name of MCP_TOOLS) {
    if (name === "act") {
      server.registerTool(
        name,
        {
          description: descriptions.act,
          inputSchema: z.object({
            decision: z.enum(["guard", "dismiss", "escalate"]),
            reasoning: z.string(),
            depth: depthField,
            stepId: z.string().optional(),
            runId: z.string().optional(),
          }),
        },
        async (args) => reply(name, args),
      );
      continue;
    }
    server.registerTool(
      name,
      {
        description: descriptions[name],
        inputSchema: z.object({ depth: depthField }),
      },
      async (args) => reply(name, args),
    );
  }
  return server;
}

async function reply(name: McpToolName, args: { depth?: number; decision?: string; reasoning?: string; stepId?: string; runId?: string }) {
  try {
    const graph = await openLoaded();
    const result = await callSeverTool(graph, name, args);
    return { content: [{ type: "text" as const, text: JSON.stringify(result) }] };
  } catch (error) {
    const message = error instanceof Error ? error.message : "tool failed";
    return { content: [{ type: "text" as const, text: message }], isError: true };
  }
}

async function handle(request: Request) {
  const server = severServer();
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  await server.connect(transport);
  return transport.handleRequest(request);
}

export { handle as GET, handle as POST, handle as DELETE };
