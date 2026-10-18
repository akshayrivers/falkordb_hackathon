import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { repoRoot } from "@/lib/paths";
import { act, bfs, coverCovered, coverUncovered, guardMark, latestStep, listFunctions, locate, maxFlow, reachCalls, shortest } from "@/lib/queries";

describe("query notes", () => {
  it("matches the queries in docs/queries.md", () => {
    const docs = readFileSync(path.join(repoRoot(), "docs", "queries.md"), "utf8");
    for (const query of [locate, coverUncovered, coverCovered, bfs, shortest, maxFlow, act, listFunctions, reachCalls, latestStep, guardMark]) {
      expect(docs).toContain(query);
    }
  });

  it("keeps act to a single statement", () => {
    expect(act.includes(";")).toBe(false);
    expect(act).toContain("guard");
    expect(act).toContain("dismiss");
    expect(act).toContain("escalate");
  });
});
