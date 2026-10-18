import { afterAll, beforeAll, expect, it } from "vitest";

import { openGraph, type GraphSession } from "@/lib/graph";
import { loadCorpus, readCorpus } from "@/lib/load";
import { SINK_ID } from "@/lib/model";
import { StrangerNameError, defaultReasoning } from "@/lib/names";
import { countRenames } from "@/lib/queries";
import { cellNumber, rowsOf } from "@/lib/rows";
import { commitAct, readSurvey } from "@/lib/tools";

let session: GraphSession;

beforeAll(async () => {
  session = await openGraph("sever_test");
  try {
    await session.deleteGraph();
  } catch {
    // The test graph is created by the load.
  }
  await loadCorpus(session, await readCorpus());
}, 180_000);

afterAll(async () => {
  await session?.close();
});

it("matches the rustypaste v0.18.0 drawing", async () => {
  const survey = await readSurvey(session, 3);
  expect(survey.uncovered).toEqual([
    {
      qual: "Paste::store_file",
      sinkLine: 214,
      sinkOrder: 41,
      guardOrder: 28,
      guardLine: 180,
    },
  ]);
  expect(survey.covered.map((row) => row.qual)).toContain("Paste::store_url");
  const covered = survey.covered.find((row) => row.qual === "Paste::store_url");
  expect(covered?.guardLine).toBe(346);
  expect(survey.config).toEqual({
    key: "auth_tokens",
    table: "server",
    assigned: false,
    line: 13,
    enables: "upload",
  });
  expect(survey.build).toEqual({
    file: ".github/workflows/docker.yml",
    ships: "Paste::store_file",
  });
  expect(survey.shortestHops).toBe(2);
  expect(survey.maxFlow).toBeGreaterThan(0);
  expect(survey.reached).toContain("set_file_name");
  expect(survey.guarded).toBe(false);
  expect(survey.reachedSink).toBe(true);

  const renames = survey.body.filter((call) => call.name === "set_file_name");
  expect(renames.map((call) => [call.order, call.line, call.insideHeaderOverride])).toEqual([
    [39, 208, false],
    [41, 214, true],
    [56, 227, false],
  ]);

  const counted = rowsOf(await session.read(countRenames, { id: SINK_ID }));
  expect(cellNumber(counted[0]?.calls)).toBe(3);
});

it("does not store a function name missing from the tool payload", async () => {
  const survey = await readSurvey(session, 3);
  const before = rowsOf(await session.read("MATCH (s:Step) RETURN count(s) AS steps"));
  await expect(
    commitAct(session, {
      decision: "guard",
      reasoning: `${defaultReasoning(new Set(survey.names))} Also \`not_a_function\`.`,
      allowed: new Set(survey.names),
    }),
  ).rejects.toBeInstanceOf(StrangerNameError);
  const after = rowsOf(await session.read("MATCH (s:Step) RETURN count(s) AS steps"));
  expect(after).toEqual(before);
});

it("cuts the header rename off at depth 1 and still reports the uncovered row", async () => {
  const survey = await readSurvey(session, 1);
  expect(survey.body).toEqual([]);
  expect(survey.shortestHops).toBeNull();
  expect(survey.reachedSink).toBe(false);
  expect(survey.uncovered[0]?.sinkOrder).toBe(41);
});

it("writes guard in one statement against the uncovered function", async () => {
  const survey = await readSurvey(session, 3);
  const result = await commitAct(session, {
    decision: "guard",
    reasoning: defaultReasoning(new Set(survey.names)),
    allowed: new Set(survey.names),
  });
  expect(result.kind).toBe("guard");
  expect(result.targetId).toBe(SINK_ID);
  const stored = rowsOf(
    await session.read(
      "MATCH (step:Step {id: $stepId})-[found:FOUND]->(target) RETURN found.role AS role, step.reasoning AS reasoning, target.id AS targetId",
      { stepId: result.stepId },
    ),
  );
  expect(stored[0]).toMatchObject({ role: "uncovered", targetId: SINK_ID });
  expect(String(stored[0]?.reasoning)).toContain("`store_file`");
  expect(String(stored[0]?.reasoning)).not.toContain("not_a_function");
  const guarded = await readSurvey(session, 3);
  expect(guarded.uncovered).toEqual([]);
  expect(guarded.guarded).toBe(true);
  expect(guarded.lastDecision?.kind).toBe("guard");
  expect(guarded.lastDecision?.qual).toContain("store_file");
  expect(guarded.reachedSink).toBe(true);
});

it("leaves the uncovered row when the decision is dismiss", async () => {
  await session.write("MATCH (:Step)-[decided:DECIDED]->() DELETE decided");
  const open = await readSurvey(session, 3);
  expect(open.guarded).toBe(false);
  expect(open.uncovered[0]?.sinkOrder).toBe(41);
  const result = await commitAct(session, {
    decision: "dismiss",
    reasoning: defaultReasoning(new Set(open.names)),
    allowed: new Set(open.names),
  });
  expect(result.kind).toBe("dismiss");
  const again = await readSurvey(session, 3);
  expect(again.guarded).toBe(false);
  expect(again.uncovered[0]?.sinkOrder).toBe(41);
  expect(again.lastDecision?.kind).toBe("dismiss");
});
