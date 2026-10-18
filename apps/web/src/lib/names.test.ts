import { describe, expect, it } from "vitest";

import { act } from "@/lib/queries";
import { StrangerNameError, assertNamesFromPayload, defaultReasoning } from "@/lib/names";
import { commitAct, hiddenSurvey } from "@/lib/tools";

const allowed = new Set(["store_file", "safe_path_join", "set_file_name", "store_url", "upload"]);

describe("name check", () => {
  it("rejects a function name that was not in the tool payload and does not write", async () => {
    const writes: string[] = [];
    const graph = {
      write: async (query: string) => {
        writes.push(query);
        return { data: [] };
      },
    };
    await expect(
      commitAct(graph, {
        decision: "guard",
        reasoning: "The uncovered call is `store_file`, then `not_a_function`.",
        allowed,
      }),
    ).rejects.toBeInstanceOf(StrangerNameError);
    expect(writes).toEqual([]);
  });

  it("stores reasoning only after every backtick name is in the payload", () => {
    expect(assertNamesFromPayload(defaultReasoning(allowed), allowed)).toEqual([
      "store_file",
      "safe_path_join",
      "set_file_name",
      "store_url",
      "upload",
    ]);
  });

  it("writes the decision in one Cypher statement", async () => {
    const writes: string[] = [];
    const graph = {
      write: async (query: string) => {
        writes.push(query);
        return {
          data: [{ stepId: "step-1", kind: "guard", targetId: "src/paste.rs::Paste::store_file" }],
        };
      },
    };
    const result = await commitAct(graph, {
      decision: "guard",
      reasoning: defaultReasoning(allowed),
      allowed,
      stepId: "step-1",
      runId: "run-1",
    });
    expect(writes).toEqual([act]);
    expect(act.includes(";")).toBe(false);
    expect(result.kind).toBe("guard");
    expect(result.targetId).toBe("src/paste.rs::Paste::store_file");
  });

  it("hides the path and the act button when the graph is off", () => {
    const survey = hiddenSurvey();
    expect(survey.graph).toBe(false);
    expect(survey.body).toEqual([]);
    expect(survey.uncovered).toEqual([]);
    expect(survey.actEnabled).toBe(false);
  });
});
