import { clampDepth, hiddenSurvey } from "@/lib/tools";

export const maxDuration = 60;
export const preferredRegion = "bom1";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const depth = clampDepth(Number(url.searchParams.get("depth") ?? "3"));
  const repo = url.searchParams.get("repo") ?? "rustypaste";
  const fn = url.searchParams.get("fn") ?? undefined;
  if (url.searchParams.get("graph") === "off") {
    return Response.json({ ...hiddenSurvey(depth), caseId: repo });
  }
  try {
    const { openCase } = await import("@/lib/ingest");
    return Response.json(await openCase(repo, depth, fn));
  } catch (error) {
    const message = error instanceof Error ? error.message : "graph read failed";
    return Response.json({ error: message }, { status: 500 });
  }
}
