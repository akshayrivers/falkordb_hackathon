# Sever — working list

Pre-event planning note, 10 October 2026. Rule 8 of Graph Hacks allows notes before 15 October. This file is not the product. Parser, Cypher, tools, prompts, and UI start 15 October, 12:01 AM IST.

The spec is the plan. This list is what to build, in order, and what to skip.

## Win read

The differentiator is one sentence: one CVE is not one answer. The same advisory is four nodes — covered path, uncovered path, config-dormant, and the build that ships the uncovered path. The act writes a guard and the same query is replayed until the uncovered node is gone. "Triage the findings" is the category Hopper already occupied. A tour of extra features does not replace that split.

A Track 01 placement is realistic if a judge can see those four nodes, watch the replay, watch the verdict disappear when FalkorDB is turned off, and you can explain every query on that path.

It is not a favorite on paper. FalkorDB already highlighted Hopper, a security graph that stopped at "does this advisory reach a customer." About 4,896 people were registered when planning started. Registration is not the number of submissions, and no rubric is published. Entering three half-built tracks loses to one finished oracle.

The ways this loses, in order: building the whole feature list halfway, the call `order` not being real in the source, and being unable to explain a query out loud.

Delivering every feature, finished, still does not decide the prize. It only removes the half-built failure. A smaller project with one clearer path can beat a tour of lenses, weights, clippy, and a second CVE. A working submission can also be rejected when the author cannot explain the queries. Finished is the price of being considered.

## Must ship

Done when a stranger can clone, run Docker Compose, and see the rustypaste path from the video.

- [x] `syn` emits `CALLS` with `order` and `line` for rustypaste `v0.18.0`.
- [x] The order matches a hand drawing. The check and `set_file_name` share one straight-line body. If they do not, stop and rewrite the story before any UI.
- [x] Advisory from the public issue and fix commit. `SINKS` and `SANITIZES` point only at functions that diff touches.
- [x] One `ENABLES` edge from the uploads flag in `config.toml`. No fuzzy key-name matcher.
- [x] One `SHIPS` or `BUILDS` edge from `Dockerfile` or `.github/workflows/docker.yml`.
- [x] `locate`, `trace`, and `cover` match the drawing with no model in the loop.
- [x] Name check: a `Step` cannot store a function name that was not in the tool payload. A test proves this.
- [x] `Run` and `Step` in the same tenant graph. `reasoning` is a property on `Step`. `FOUND` points at corpus nodes.
- [x] `act` writes guard, dismiss, or escalate in one Cypher statement.
- [x] One screen: hops lighting up, depth control, Graph-off. Graph-off hides the path and the act button.
- [x] `README.md` with setup, graph model, tracks, AI disclosure, FalkorDB SSPLv1 line.
- [x] `docs/queries.md` with the real `algo.bfs`, `algo.SPpaths`, and `algo.maxFlow` calls, plus the relationship-alias workaround.
- [ ] Two-minute video from that local app.
- [ ] Blog URL in the submission. You write the post.

## Drops first

Build these only after every must-ship box above is true. Drop from the top.

- [ ] `cargo clippy --message-format=json` as `Diagnostic` nodes. No `--fix`.
- [ ] `cargo test -- --list`, then only tests whose names relate to upload or path.
- [ ] `propose_lens`.
- [ ] Lens weights (`prior`, `accepts`, `expansions`, `overrides`).
- [ ] Official `@falkordb/mcpserver` in read-only mode.
- [ ] Second repo and a famous CVE, leading candidate CVE-2022-24713, only if a pinned tag still calls the affected API.
- [ ] Second tenant graph.
- [ ] Max-flow node-split. The order compare is the story. Max-flow is a check digit.

Tracks 02 and 03 go on the form only when the second tenant, or the author and past-decision hops, are in the video. Track 01 goes on the form either way.

## Before 15 October

No product code. No schema-as-code. No queries copied into a repo you will submit as written during the event.

- [x] Generic Next.js shell on port 4317, and Docker Compose for an empty FalkorDB. No client, no schema, no seed.
- [ ] Register on the WeMakeDevs form.
- [ ] Read `v0.18.0` `src/paste.rs`, `src/header.rs`, issue 622, and fix `ac05d552`. Draw both orders, with line numbers.
- [x] Confirm the check and `set_file_name` are in one straight-line body. Write the hop count. If `maxLen` 3 would truncate it, the default depth becomes that count.
- [x] Confirm the uploads flag name in `config.toml`, and which workflow file publishes the image.
- [ ] Throwaway Docker spike of `algo.bfs`, `algo.SPpaths`, and `algo.maxFlow` from the docs. Delete it. You should be able to say what each one yields.
- [ ] Gemini API key works. Docker works. Rust toolchain can compile a hello-world `syn` visitor, then delete that visitor.
- [ ] Be able to explain, without notes: why the relationship alias must be referenced, why writes are one statement, why reasoning is not evidence, why a free shell fails the removal test.

## 15 October — day 1

- [x] Pin rustypaste `v0.18.0`. Inventory files.
- [x] `crates/extract` prints JSON: functions, ordered calls, externals.
- [x] Compare JSON to the drawing. Fix the visitor or change the claim. Do not continue past a mismatch.
- [x] Docker Compose: FalkorDB on 6379, browser on 3000, app on another port, data volume.
- [x] Batched `MERGE` for functions and `CALLS`. Unique constraint on function identity.
- [x] Load the advisory, the explicit config flag, and one publish edge.
- [x] `locate`, `trace`, `cover` from a test, no Gemini. Edge alias referenced in every count.
- [x] Name-check unit test fails the build when a stranger name is stored.
- [x] `act` as one `GRAPH.QUERY`. `GRAPH.RO_QUERY` for reads.

Day 1 is done when those tools match the drawing. It is not done when the UI looks finished.

## 16 October — day 2

- [x] `Run`, `Step`, `Finding`. Reasoning written only after the name check.
- [x] Investigator and Clerk in LangGraph.js. Intent enum is only `triage`, `walkthrough`, or `both`.
- [x] Our MCP exposes `walk`, `locate`, `trace`, `cover`, `act`.
- [x] Screen plays the hops. Depth control. Graph-off.
- [ ] If, and only if, the screen matches the drawing: pick the next item from "Drops first." One item. Re-run the oracle after it.

## 17–18 October — day 3

- [ ] Record the video before more features. The spoken order is in `docs/video-script.md`: plain Gemini, then locate, then the ordered calls, then cover, then act, then Graph-off.
- [x] README stranger-test. Someone who is not you can follow it, or you follow it on a clean shell.
- [x] `docs/queries.md` matches the queries in the running code, not the ones in this note.
- [x] AI disclosure: Cursor and any other assistant, and that you can explain the model.
- [ ] Blog URL in the submission. The draft is `docs/blog.md`. You publish it.
- [ ] Submit before the evening of the 18th. Form tracks match what the video shows. Track 01.

## Stack to create, and nothing else

- `apps/web` — Next.js, TypeScript, Tailwind, shadcn, `@xyflow/react`, LangGraph.js, Gemini Flash, `falkordb` client, `@modelcontextprotocol/sdk`.
- `crates/extract` — Rust, `syn`, `serde_json`.
- `docker-compose.yml` — `falkordb/falkordb`.
- Vitest for the name check and the oracle comparison.
- pnpm workspace. No Turborepo, no Python service, no auth, no second database.

## Do not build

- A free shell for the agent.
- QueryWeaver, Graphiti, Cognee, or the GraphRAG SDK on the verdict path.
- Vector search as proof that a path is missing.
- Joern, CodeQL, or a second graph database.
- An issue opened against someone else's repository.
- Emails from git blame.
- A second copy of the codebase.
