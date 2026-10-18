import { Suspense } from "react";
import { connection } from "next/server";

import { Investigation } from "@/components/investigation";
import { listCases } from "@/lib/cases";
import type { Survey } from "@/lib/model";
import { clampDepth, hiddenSurvey } from "@/lib/tools";

export default function Home({
  searchParams,
}: {
  searchParams: Promise<{ graph?: string; depth?: string; repo?: string; fn?: string }>;
}) {
  return (
    <Suspense fallback={<p className="px-6 py-8 text-sm">Reading FalkorDB…</p>}>
      <Loaded searchParams={searchParams} />
    </Suspense>
  );
}

async function Loaded({
  searchParams,
}: {
  searchParams: Promise<{ graph?: string; depth?: string; repo?: string; fn?: string }>;
}) {
  await connection();
  const params = await searchParams;
  const depth = clampDepth(Number(params.depth ?? "3"));
  const cases = await listCases();
  const repo = cases.some((item) => item.id === params.repo) ? (params.repo ?? "rustypaste") : "rustypaste";
  if (params.graph === "off") {
    return (
      <Investigation
        initial={{ ...hiddenSurvey(depth), caseId: repo }}
        initialGraphOn={false}
        initialDepth={depth}
        cases={cases}
        repoId={repo}
        key={repo}
      />
    );
  }
  let initial: Survey | null = null;
  let initialError: string | null = null;
  try {
    const { openCase } = await import("@/lib/ingest");
    initial = await openCase(repo, depth, params.fn);
  } catch (error) {
    initialError = error instanceof Error ? error.message : "graph read failed";
  }
  return (
    <Investigation
      initial={initial}
      initialError={initialError}
      initialDepth={depth}
      cases={cases}
      repoId={repo}
      key={repo}
    />
  );
}

