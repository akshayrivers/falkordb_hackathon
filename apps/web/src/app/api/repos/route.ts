export async function GET() {
  const { listCases } = await import("@/lib/cases");
  return Response.json({ cases: await listCases() });
}

export async function POST(request: Request) {
  let body: { source?: string; ref?: string; preset?: string };
  try {
    body = (await request.json()) as { source?: string; ref?: string; preset?: string };
  } catch {
    return Response.json({ error: "expected JSON" }, { status: 400 });
  }
  try {
    const { addRepo } = await import("@/lib/ingest");
    return Response.json(await addRepo(body));
  } catch (error) {
    const message = error instanceof Error ? error.message : "could not add repo";
    return Response.json({ error: message }, { status: 400 });
  }
}
