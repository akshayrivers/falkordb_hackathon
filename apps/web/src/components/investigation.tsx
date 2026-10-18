"use client";

import { ReactFlow } from "@xyflow/react";
import { useEffect, useMemo, useRef, useState } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useDarkClass } from "@/components/theme";
import type { CaseRecord } from "@/lib/cases";
import type { BodyCall, Decision, Intent, Survey } from "@/lib/model";
import { DECISIONS, INTENTS } from "@/lib/model";
import { hiddenSurvey } from "@/lib/tools";

import "@xyflow/react/dist/style.css";

export function Investigation({
  initial = null,
  initialError = null,
  initialGraphOn = true,
  initialDepth = 3,
  cases = [],
  repoId = "rustypaste",
}: {
  initial?: Survey | null;
  initialError?: string | null;
  initialGraphOn?: boolean;
  initialDepth?: number;
  cases?: CaseRecord[];
  repoId?: string;
}) {
  const [depth, setDepth] = useState(initialDepth);
  const [graphOn, setGraphOn] = useState(initialGraphOn);
  const [survey, setSurvey] = useState<Survey | null>(initial);
  const [error, setError] = useState<string | null>(initialError);
  const [loading, setLoading] = useState(false);
  const [beat, setBeat] = useState(-1);
  const [playing, setPlaying] = useState(false);
  const [reasoning, setReasoning] = useState("");
  const [stepId, setStepId] = useState<string | undefined>();
  const [runId, setRunId] = useState<string | undefined>();
  const [decision, setDecision] = useState<Decision | null>(null);
  const [actError, setActError] = useState<string | null>(null);
  const [acting, setActing] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [intent, setIntent] = useState<Intent>("triage");
  const [investigating, setInvestigating] = useState(false);
  const [toolsUsed, setToolsUsed] = useState<string[]>([]);
  const [skipped, setSkipped] = useState<string[]>([]);
  const [findings, setFindings] = useState<string[]>([]);
  const [usedModel, setUsedModel] = useState(false);
  const [plain, setPlain] = useState<string | null>(null);
  const [plainError, setPlainError] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);
  const [source, setSource] = useState("");
  const [localPath, setLocalPath] = useState("");
  const [gitRef, setGitRef] = useState("");
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [selectedFn, setSelectedFn] = useState(initial?.selectedId ?? "");
  const [lens, setLens] = useState<"calls" | "reach">("calls");
  const [revision, setRevision] = useState(0);
  const keepReasoning = useRef(false);
  const dark = useDarkClass();

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!graphOn) {
      setSurvey(hiddenSurvey(depth));
      setError(null);
      setLoading(false);
      setBeat(-1);
      setPlaying(false);
      setDecision(null);
      setStepId(undefined);
      setRunId(undefined);
      setToolsUsed([]);
      setSkipped([]);
      setFindings([]);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    fetch(
      `/api/survey?depth=${depth}&repo=${encodeURIComponent(repoId)}&fn=${encodeURIComponent(selectedFn)}`,
      { signal: controller.signal },
    )
      .then(async (response) => {
        const body = (await response.json()) as Survey & { error?: string };
        if (!response.ok) throw new Error(body.error ?? "survey failed");
        setSurvey(body);
        if (!keepReasoning.current) setReasoning(body.reasoning);
        setError(null);
        setBeat(-1);
      })
      .catch((caught: unknown) => {
        if (caught instanceof DOMException && caught.name === "AbortError") return;
        setSurvey(null);
        setError(caught instanceof Error ? caught.message : "survey failed");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [graphOn, depth, repoId, selectedFn, revision]);

  useEffect(() => {
    keepReasoning.current = false;
  }, [depth, repoId]);

  const beats = useMemo(() => storyBeats(survey?.body ?? [], survey?.verdict !== false), [survey]);
  const cursor = beat >= 0 ? beats[beat]?.order ?? 0 : 0;

  useEffect(() => {
    if (!playing) return;
    if (beat >= beats.length - 1) {
      setPlaying(false);
      return;
    }
    const timer = window.setTimeout(() => setBeat((current) => current + 1), 700);
    return () => window.clearTimeout(timer);
  }, [playing, beat, beats.length]);

  const picture = useMemo(() => {
    if (!survey?.graph) return { nodes: [], edges: [] };
    if (!survey.verdict) return repoPicture(survey, lens, cursor, beat >= 0);
    return flowPicture(survey, cursor, beat >= 0);
  }, [survey, cursor, beat, lens]);

  async function addSource() {
    setAdding(true);
    setAddError(null);
    try {
      const response = await fetch("/api/repos", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ source: source.trim() || localPath.trim(), ref: gitRef }),
      });
      const body = (await response.json()) as { id?: string; error?: string };
      if (!response.ok || !body.id) throw new Error(body.error ?? "could not add repo");
      window.location.href = `/?repo=${encodeURIComponent(body.id)}&depth=${depth}`;
    } catch (caught) {
      setAddError(caught instanceof Error ? caught.message : "could not add repo");
    } finally {
      setAdding(false);
    }
  }

  async function addPreset() {
    setAdding(true);
    setAddError(null);
    try {
      const response = await fetch("/api/repos", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ preset: "extractor" }),
      });
      const body = (await response.json()) as { id?: string; error?: string };
      if (!response.ok || !body.id) throw new Error(body.error ?? "could not add repo");
      window.location.href = `/?repo=${encodeURIComponent(body.id)}&depth=${depth}`;
    } catch (caught) {
      setAddError(caught instanceof Error ? caught.message : "could not add repo");
    } finally {
      setAdding(false);
    }
  }

  async function onPlain() {
    setAsking(true);
    setPlainError(null);
    try {
      const response = await fetch("/api/plain", { method: "POST" });
      const body = (await response.json()) as { text?: string; error?: string };
      if (!response.ok) throw new Error(body.error ?? "gemini failed");
      setPlain(body.text ?? "");
    } catch (caught) {
      setPlain(null);
      setPlainError(caught instanceof Error ? caught.message : "gemini failed");
    } finally {
      setAsking(false);
    }
  }

  async function onInvestigate() {
    if (!survey?.actEnabled) return;
    setInvestigating(true);
    setActError(null);
    try {
      const response = await fetch("/api/investigate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ intent, depth }),
      });
      const body = (await response.json()) as {
        error?: string;
        tools?: string[];
        skipped?: string[];
        findings?: string[];
        reasoning?: string;
        decision?: string;
        stepId?: string;
        runId?: string;
        usedModel?: boolean;
      };
      if (!response.ok) throw new Error(body.error ?? "investigate failed");
      setToolsUsed(body.tools ?? []);
      setSkipped(body.skipped ?? []);
      setFindings(body.findings ?? []);
      setUsedModel(Boolean(body.usedModel));
      if (body.reasoning) setReasoning(body.reasoning);
      keepReasoning.current = true;
      setStepId(body.stepId);
      setRunId(body.runId);
      setDecision(body.decision ? (body.decision as Decision) : null);
      setRevision((current) => current + 1);
    } catch (caught) {
      setActError(caught instanceof Error ? caught.message : "investigate failed");
    } finally {
      setInvestigating(false);
    }
  }

  async function onAct(next: Decision) {
    if (!survey?.actEnabled) return;
    setActing(true);
    setActError(null);
    try {
      const response = await fetch("/api/act", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ decision: next, reasoning, stepId, runId, depth }),
      });
      const body = (await response.json()) as {
        error?: string;
        stepId?: string;
        runId?: string;
        kind?: Decision;
      };
      if (!response.ok) throw new Error(body.error ?? "act failed");
      setStepId(body.stepId);
      setRunId(body.runId);
      setDecision(body.kind ?? next);
      keepReasoning.current = true;
      setRevision((current) => current + 1);
    } catch (caught) {
      setActError(caught instanceof Error ? caught.message : "act failed");
    } finally {
      setActing(false);
    }
  }

  const uncovered = survey?.uncovered[0];
  const covered = survey?.covered.find((row) => row.qual.includes("store_url")) ?? survey?.covered[0];

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8 sm:px-6">
      <header className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary">{survey?.caseLabel ?? cases.find((item) => item.id === repoId)?.label ?? "rustypaste v0.18.0"}</Badge>
          {survey?.verdict !== false ? <Badge variant="outline">issue 622</Badge> : <Badge variant="outline">call graph</Badge>}
        </div>
        <h1 className="font-heading text-3xl font-semibold tracking-tight">Sever</h1>
        <p className="max-w-3xl text-sm leading-6">
          Sever is a Track 01 agent. It loads a repository into FalkorDB and acts on the calls it finds.{" "}
          <a href="/help" className="underline underline-offset-4">
            What this is, what it does, and how.
          </a>
        </p>
        <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
          {survey?.verdict === false ? (
            <>
              Ordered calls for this project. The issue 622 verdict, the config flag, and the Docker
              publish edge stay on rustypaste.
            </>
          ) : (
            <>
              One advisory, four answers. The header rename in <code>Paste::store_file</code> sits
              after <code>safe_path_join</code> in the same body. <code>Paste::store_url</code> binds
              the header first. The shipped config leaves upload open, and the Docker workflow
              publishes that binary.
            </>
          )}
        </p>
      </header>

      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm">
          Depth
          <input
            aria-label="Depth"
            type="range"
            min={1}
            max={4}
            value={depth}
            onChange={(event) => setDepth(Number(event.target.value))}
          />
          <span className="w-4 tabular-nums">{depth}</span>
        </label>
        <Button
          variant={graphOn ? "outline" : "default"}
          aria-pressed={graphOn}
          nativeButton={false}
          render={<a href={graphOn ? `/?graph=off&repo=${encodeURIComponent(repoId)}` : `/?depth=${depth}&repo=${encodeURIComponent(repoId)}`} />}
        >
          {graphOn ? "Turn graph off" : "Turn graph on"}
        </Button>
        <Button variant="outline" disabled={asking} onClick={() => void onPlain()}>
          {asking ? "Asking Gemini…" : "Ask Gemini"}
        </Button>
        <span className="text-xs text-muted-foreground">
          {survey?.verdict === false
            ? "Calls and Reach are this project. A local path is only for testing on this machine."
            : "Direct path is 2 hops. Remote upload adds a third. Order is the place in the body, not the hop count."}
        </span>
      </div>

      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          void addSource();
        }}
      >
        <label className="flex flex-col gap-1 text-sm">
          Repo
          <select
            aria-label="Repo"
            className="rounded-lg border bg-background px-2 py-1"
            value={repoId}
            onChange={(event) => {
              window.location.href = `/?repo=${encodeURIComponent(event.target.value)}&depth=${depth}`;
            }}
          >
            {cases.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
        {(survey?.functions.length ?? 0) > 0 ? (
          <label className="flex flex-col gap-1 text-sm">
            Function
            <select
              aria-label="Function"
              className="max-w-xs rounded-lg border bg-background px-2 py-1"
              value={selectedFn || survey?.selectedId || ""}
              onChange={(event) => setSelectedFn(event.target.value)}
            >
              {survey?.functions.map((fn) => (
                <option key={fn.id} value={fn.id}>
                  {fn.qual} · {fn.file}:{fn.line}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <details className="basis-full">
          <summary className="cursor-pointer text-sm text-muted-foreground">Add another repository</summary>
          <div className="flex flex-wrap items-end gap-2 pt-2">
        <label className="flex min-w-64 flex-1 flex-col gap-1 text-sm">
          Git link
          <input
            aria-label="Repository source"
            className="rounded-lg border bg-background px-2 py-1"
            placeholder="https://github.com/owner/repo or a source file"
            value={source}
            onChange={(event) => setSource(event.target.value)}
          />
        </label>
        <label className="flex w-28 flex-col gap-1 text-sm">
          Tag
          <input
            aria-label="Git tag"
            className="rounded-lg border bg-background px-2 py-1"
            placeholder="optional"
            value={gitRef}
            onChange={(event) => setGitRef(event.target.value)}
          />
        </label>
        <label className="flex min-w-52 flex-col gap-1 text-sm">
          Local project
          <input
            aria-label="Local project"
            className="rounded-lg border bg-background px-2 py-1"
            placeholder="/absolute/path"
            value={localPath}
            onChange={(event) => setLocalPath(event.target.value)}
          />
        </label>
        <Button
          type="submit"
          variant="outline"
          disabled={adding || (source.trim().length === 0 && localPath.trim().length === 0)}
        >
          {adding ? "Adding…" : "Add"}
        </Button>
        {cases.some((item) => item.id === "extract") ? null : (
          <Button type="button" variant="outline" disabled={adding} onClick={() => void addPreset()}>
            Add Sever extractor
          </Button>
        )}
          </div>
        </details>
      </form>
      {addError ? (
        <Alert>
          <AlertTitle>Repo was not added.</AlertTitle>
          <AlertDescription>{addError}</AlertDescription>
        </Alert>
      ) : null}

      {plain ? (
        <Alert>
          <AlertTitle>Gemini, before the graph.</AlertTitle>
          <AlertDescription>
            {plain} This sentence is not evidence. It was asked with no query results.
          </AlertDescription>
        </Alert>
      ) : null}
      {plainError ? (
        <Alert>
          <AlertTitle>Gemini did not answer.</AlertTitle>
          <AlertDescription>{plainError}</AlertDescription>
        </Alert>
      ) : null}

      {error ? (
        <Alert>
          <AlertTitle>The graph did not answer.</AlertTitle>
          <AlertDescription>
            {error}
            {error.includes("ECONNREFUSED")
              ? " Start Docker, then run docker compose up in this repo."
              : ""}
          </AlertDescription>
        </Alert>
      ) : null}

      {!graphOn ? (
        <Alert>
          <AlertTitle>Graph is off.</AlertTitle>
          <AlertDescription>
            The path stays hidden, and so does the act button. Turning FalkorDB off removes the
            verdict.
          </AlertDescription>
        </Alert>
      ) : null}

      {survey?.graph && survey.verdict && survey.lastDecision ? (
        <p className="text-sm leading-6">
          {survey.lastDecision.kind
            ? `Last decision: ${survey.lastDecision.kind} on ${survey.lastDecision.qual}.`
            : "Last step recorded. No guard was stored."}
        </p>
      ) : null}

      {survey?.graph && survey.verdict && !survey.reachedSink ? (
        <Alert>
          <AlertTitle>This depth stops short.</AlertTitle>
          <AlertDescription>
            The walk does not reach set_file_name, so Investigate will not store a guard.
          </AlertDescription>
        </Alert>
      ) : null}

      {survey?.graph && survey.verdict ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <Fact
            title="Covered"
            source="cover"
            body={
              covered
                ? `${covered.qual} calls safe_path_join on line ${covered.guardLine}, after the header binding.`
                : "No covered body."
            }
          />
          <Fact
            title="Uncovered"
            source="cover"
            body={
              uncovered
                ? `${uncovered.qual} calls safe_path_join at order ${uncovered.guardOrder}, then set_file_name at order ${uncovered.sinkOrder} on line ${uncovered.sinkLine}.`
                : survey.guarded
                  ? "Guarded. Paste::store_file is no longer uncovered. The same cover query skipped it."
                  : "No uncovered body."
            }
          />
          <Fact
            title="Config"
            source="locate"
            body={
              survey.config
                ? `${survey.config.table}.${survey.config.key} is ${survey.config.assigned ? "assigned" : "commented out"} on line ${survey.config.line}. That ENABLES ${survey.config.enables}.`
                : "No config edge."
            }
          />
          <Fact
            title="Build"
            source="locate"
            body={
              survey.build
                ? `${survey.build.file} SHIPS ${survey.build.ships}.`
                : "No publish edge."
            }
          />
        </div>
      ) : null}

      {survey?.graph ? (
        <section className="grid gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(18rem,0.9fr)]">
          <Card>
            <CardHeader>
              <CardTitle>
                {survey.verdict
                  ? "Walk from upload"
                  : lens === "calls"
                    ? "Calls from the selected function"
                    : "Reach from the selected function"}
              </CardTitle>
              <CardDescription>
                {loading
                  ? "Reading FalkorDB…"
                  : survey.verdict
                    ? `Queries bfs, shortest, maxFlow. BFS reached ${survey.reached.length} names. Shortest path weight ${survey.shortestHops ?? "none"}. Max flow ${survey.maxFlow ?? "none"}. Three CALLS edges to set_file_name are one FLOW edge. Max flow is that capacity, not a hop count.`
                    : lens === "calls"
                      ? `${survey.body.length} direct calls. Step lights them in order.`
                      : survey.depth < 2
                        ? "Depth 2 opens the next call after each direct callee."
                        : `${survey.reach.length} next calls. Depth is ${survey.depth}.`}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {survey.verdict ? null : (
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant={lens === "calls" ? "default" : "outline"}
                    onClick={() => {
                      setLens("calls");
                      setPlaying(false);
                      setBeat(-1);
                    }}
                  >
                    Calls
                  </Button>
                  <Button
                    type="button"
                    variant={lens === "reach" ? "default" : "outline"}
                    onClick={() => {
                      setLens("reach");
                      setPlaying(false);
                      setBeat(-1);
                    }}
                  >
                    Reach
                  </Button>
                </div>
              )}
              <div className="h-[420px] overflow-hidden rounded-lg border">
                {mounted ? (
                  <ReactFlow
                    key={survey.verdict ? String(survey.depth) : `${survey.selectedId}-${lens}-${survey.depth}`}
                    nodes={picture.nodes}
                    edges={picture.edges}
                    colorMode={dark ? "dark" : "light"}
                    fitView
                    nodesDraggable={false}
                    nodesConnectable={false}
                    elementsSelectable={false}
                    proOptions={{ hideAttribution: false }}
                  />
                ) : (
                  <p className="p-4 text-sm leading-6 text-muted-foreground">
                    {survey.reached.slice(0, 40).join(", ") || "No names reached."}
                    {survey.reached.length > 40 ? "…" : ""}
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>{survey.verdict ? "store_file body" : (survey.functions.find((fn) => fn.id === survey.selectedId)?.qual ?? "Function body")}</CardTitle>
              <CardDescription>
                {survey.verdict
                  ? survey.body.length === 0
                    ? "Depth 1 stops at upload's callees. The header rename is the next hop."
                    : `${survey.body.length} calls. The header rename is the lit row inside the override.`
                  : survey.body.length === 0
                    ? "This function has no recorded calls."
                    : `${survey.body.length} ordered calls. Issue 622's four answers stay on rustypaste.`}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  disabled={beats.length === 0 || beat >= beats.length - 1}
                  onClick={() => {
                    setPlaying(false);
                    setBeat((current) => Math.min(current + 1, beats.length - 1));
                  }}
                >
                  Step
                </Button>
                <Button
                  variant="outline"
                  disabled={beats.length === 0}
                  onClick={() => {
                    if (playing) {
                      setPlaying(false);
                      return;
                    }
                    if (beat >= beats.length - 1) setBeat(-1);
                    setPlaying(true);
                  }}
                >
                  {playing ? "Pause" : "Play"}
                </Button>
              </div>
              <ol className="flex max-h-80 flex-col gap-1 overflow-auto font-mono text-xs leading-5">
                {survey.body.map((call) => {
                  const active = beat >= 0 && call.order <= cursor;
                  const current = beat >= 0 && call.order === cursor;
                  return (
                    <li
                      key={`${call.order}-${call.name}`}
                      className={
                        call.insideHeaderOverride
                          ? current
                            ? "rounded bg-destructive/15 px-2 text-destructive"
                            : "rounded px-2 text-destructive"
                          : current
                            ? "rounded bg-muted px-2"
                            : active
                              ? "rounded px-2 text-foreground"
                              : "rounded px-2 text-muted-foreground"
                      }
                    >
                      {call.order} · line {call.line} · {call.name}
                      {call.insideHeaderOverride ? " · header" : ""}
                    </li>
                  );
                })}
              </ol>
            </CardContent>
          </Card>
        </section>
      ) : null}

      {survey?.actEnabled ? (
        <section className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-2 text-sm">
              Intent
              <select
                aria-label="Intent"
                className="rounded-lg border bg-background px-2 py-1"
                value={intent}
                onChange={(event) => setIntent(event.target.value as Intent)}
              >
                {INTENTS.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </label>
            <Button disabled={investigating} onClick={() => void onInvestigate()}>
              {investigating ? "Investigating…" : "Investigate"}
            </Button>
            {toolsUsed.length > 0 ? (
              <span className="text-xs text-muted-foreground">
                Chose {toolsUsed.join(", then ")}.
                {skipped.length > 0 ? ` Not called: ${skipped.join(", ")}.` : ""}
                {findings.length > 0 ? ` Findings ${findings.join(", ")}.` : ""}
                {usedModel ? " Clerk used Gemini." : " Clerk used the payload sentence."}
              </span>
            ) : null}
          </div>
          <label className="flex flex-col gap-2 text-sm">
            Reasoning
            <textarea
              className="min-h-24 rounded-lg border bg-background px-3 py-2 font-mono text-sm"
              value={reasoning}
              onChange={(event) => setReasoning(event.target.value)}
            />
          </label>
          <div className="flex flex-wrap gap-2">
            {DECISIONS.map((item) => (
              <Button key={item} disabled={acting} onClick={() => onAct(item)}>
                {item}
              </Button>
            ))}
          </div>
          {decision ? (
            <p className="text-sm">
              Recorded <span className="font-medium">{decision}</span> on the uncovered function.
            </p>
          ) : null}
          {actError ? (
            <Alert>
              <AlertTitle>Not stored.</AlertTitle>
              <AlertDescription>{actError}</AlertDescription>
            </Alert>
          ) : null}
        </section>
      ) : null}
    </main>
  );
}

function Fact({ title, source, body }: { title: string; source: string; body: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>Query {source}</CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-sm leading-6">{body}</p>
      </CardContent>
    </Card>
  );
}

function storyBeats(body: BodyCall[], verdict: boolean): BodyCall[] {
  if (!verdict) return body;
  return body.filter(
    (call) => call.name === "safe_path_join" || call.name === "set_file_name" || call.name === "create",
  );
}

function repoPicture(survey: Survey, lens: "calls" | "reach", cursor: number, playing: boolean) {
  const selected = survey.functions.find((fn) => fn.id === survey.selectedId);
  const startId = selected?.id ?? "start";
  const directs = new Map<string, BodyCall>();
  for (const call of survey.body) {
    if (!call.id || call.id === startId || directs.has(call.id)) continue;
    directs.set(call.id, call);
    if (directs.size >= 14) break;
  }
  const rows = [...directs.values()];
  const node = (id: string, label: string, x: number, y: number, lit: boolean) => ({
    id,
    position: { x, y },
    data: { label },
    style: {
      width: 180,
      fontSize: 12,
      borderRadius: 8,
      border: lit ? "2px solid var(--primary)" : "1px solid var(--border)",
      background: lit ? "var(--muted)" : "var(--card)",
      color: "var(--foreground)",
      whiteSpace: "pre-line" as const,
    },
  });
  const nodes = [node(startId, selected?.name ?? "function", 0, Math.max(0, ((rows.length - 1) * 72) / 2), true)];
  const edges: Array<{ id: string; source: string; target: string; label?: string; style?: { stroke: string; strokeWidth?: number } }> = [];
  for (const [index, call] of rows.entries()) {
    const lit = playing && cursor >= call.order;
    nodes.push(node(call.id, `${call.name}\norder ${call.order}`, 280, index * 72, lit));
    edges.push({
      id: `call-${call.id}`,
      source: startId,
      target: call.id,
      label: String(call.order),
      style: { stroke: lit ? "var(--primary)" : "var(--border)", strokeWidth: lit ? 2 : 1 },
    });
  }
  if (lens === "reach") {
    const placed = new Set(nodes.map((item) => item.id));
    let row = 0;
    for (const hop of survey.reach) {
      if (!hop.id || placed.has(hop.id) || placed.has(`reach-${hop.id}`)) continue;
      if (row >= 12) break;
      const sourceOrder = survey.body.find((call) => call.id === hop.sourceId)?.order ?? Number.POSITIVE_INFINITY;
      const lit = playing && cursor >= sourceOrder;
      const id = `reach-${hop.id}`;
      placed.add(id);
      nodes.push(node(id, `${hop.name}\nvia ${hop.sourceName}`, 560, row * 72, lit));
      edges.push({
        id: `reach-${hop.sourceId}-${hop.id}-${row}`,
        source: placed.has(hop.sourceId) ? hop.sourceId : startId,
        target: id,
        style: { stroke: lit ? "var(--primary)" : "var(--border)", strokeWidth: lit ? 2 : 1 },
      });
      row += 1;
    }
  }
  return { nodes, edges };
}

function flowPicture(survey: Survey, cursor: number, playing: boolean) {
  const uncovered = survey.uncovered[0];
  const showInner = survey.depth >= 2 && Boolean(uncovered);
  const guardLit = playing && showInner && cursor >= (uncovered?.guardOrder ?? Number.POSITIVE_INFINITY);
  const sinkLit = playing && showInner && cursor >= (uncovered?.sinkOrder ?? Number.POSITIVE_INFINITY);
  const node = (id: string, label: string, x: number, y: number, lit: boolean, sink = false) => ({
    id,
    position: { x, y },
    data: { label },
    style: {
      width: 180,
      fontSize: 12,
      borderRadius: 8,
      border: lit ? `2px solid var(${sink ? "--destructive" : "--primary"})` : "1px solid var(--border)",
      background: lit ? "var(--muted)" : "var(--card)",
      color: sink && lit ? "var(--destructive)" : "var(--foreground)",
      whiteSpace: "pre-line",
    },
  });
  const nodes = [
    node("upload", "upload", 0, 90, true),
    node("store_url", survey.covered[0]?.qual ?? "store_url", 260, 0, survey.depth >= 1),
    node("store_file", uncovered?.qual ?? "store_file", 260, 170, survey.depth >= 1),
  ];
  const edges = [
    { id: "to-url", source: "upload", target: "store_url" },
    { id: "to-file", source: "upload", target: "store_file" },
  ];
  if (showInner && uncovered) {
    nodes.push(
      node("guard", `safe_path_join\norder ${uncovered.guardOrder}`, 520, 110, guardLit, false),
      node("rename", `set_file_name\norder ${uncovered.sinkOrder}`, 520, 240, sinkLit, true),
    );
    edges.push(
      { id: "to-guard", source: "store_file", target: "guard" },
      { id: "to-rename", source: "store_file", target: "rename" },
    );
  }
  return { nodes, edges };
}
