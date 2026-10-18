# Sever

One advisory is not one answer. For rustypaste `v0.18.0`, issue 622 is four facts in FalkorDB:

- `Paste::store_url` binds the `filename` header and then calls `safe_path_join`. That body is covered.
- `Paste::store_file` calls `safe_path_join` at order 28, line 180, and later calls `set_file_name` at order 41, line 214, inside the header binding. That body is uncovered. The fix is `ac05d552`.
- `server.auth_tokens` is commented out in the shipped `config.toml`. `extract_tokens` grants `Auth` when that key is missing, so the edge `ENABLES` `upload`.
- `.github/workflows/docker.yml` builds `Dockerfile` and pushes the image on version tags. That workflow `SHIPS` `Paste::store_file`.

The direct walk from `upload` to `set_file_name` is 2 hops. The remote-file walk is 3. Order 41 is the call's place in the body, not a hop count. The default depth is 3, which is enough for both walks.

The repo menu starts on rustypaste. A GitHub, GitLab, or Codeberg link can be the repository, a folder, or one source file. Rust crates still use the syn extractor. Python, JavaScript, TypeScript, Go, Java, and the other parsed languages get a call graph from their function definitions. A local absolute path, and Add Sever extractor, stay for testing on this machine. Those graphs do not get the issue 622 verdict.

## Setup

```bash
sh scripts/pin-corpus.sh
pnpm install
pnpm extract
docker compose up -d
pnpm dev
```

Open [http://127.0.0.1:4317](http://127.0.0.1:4317). The first survey loads the extract into the `sever` graph. FalkorDB listens on port 6379. Its own browser listens on port 3000 and is not this app. Redis has no password. A `WRONGPASS` line in that browser is its generated session secret, not the Sever client.

Copy `.env.example` to `.env`. Set `GEMINI_API_KEY` if the clerk and the Ask Gemini button should call Gemini Flash. Save the file. The server reads it on each request. Without that key, Investigate still stores the sentence built from the tool payload.

`pnpm test` runs the Rust drawing check and the Vitest suite, including the graph oracle. Start Docker first. The oracle compares the live graph to the v0.18.0 drawing.

A stranger check of this setup is: the pin script prints `v0.18.0`, `pnpm extract` writes `corpus/extract.json`, `docker compose up -d` answers `PONG` on port 6379, and the page shows the four cards. The ordered calls, the cover split, the act, and Graph-off are the demo in [docs/video-script.md](docs/video-script.md).

## Graph model

| Label | Identity | Role |
| --- | --- | --- |
| `Function` | `file::qual` | A function parsed from `v0.18.0` |
| `External` | `external::path` | A callee the crate does not define, including `set_file_name` |
| `Advisory` | `issue-622` | The public report and fix `ac05d552` |
| `ConfigFlag` | `server.auth_tokens` | The shipped key, which is not assigned |
| `Build` | `docker-yml` | The workflow that publishes the image |
| `Run`, `Step`, `Finding` | ids created by the investigator | The same tenant graph, `tenant = rustypaste` |

`CALLS` carries `order`, `line`, `insideHeaderOverride`, `weight`, and `capacity`. Three `CALLS` edges run from `Paste::store_file` to `set_file_name`. `FLOW` is one edge per pair, with capacity equal to their sum, because `algo.maxFlow` rejects parallel edges. `SINKS` and `SANITIZES` point only at `Paste::store_file` and `safe_path_join`, the functions the fix diff touches. `ENABLES` is the one config edge. `SHIPS` is the one publish edge. `FOUND` points at a corpus node. `reasoning` is a property of `Step`, written only after every backtick name in it was in the tool payload.

`Function.id` has an exact-match index and a unique constraint.

Reads use `GRAPH.RO_QUERY`. Act is one `GRAPH.QUERY`. The statements are in [docs/queries.md](docs/queries.md), including `algo.bfs`, `algo.SPpaths`, and `algo.maxFlow`.

The investigator and the clerk are a LangGraph.js graph. The intent is only `triage`, `walkthrough`, or `both`. The investigator calls fixed tools. The clerk may ask Gemini Flash for one sentence, then stores that sentence only when every backtick name is already in the tool payload. `/api/mcp` exposes `walk`, `locate`, `trace`, `cover`, and `act`.

## Screen

Depth limits the walk from `upload`. Step and Play light the body of `store_file` in order. The header `set_file_name` is the uncovered row. Ask Gemini sends a prompt with no query results; that sentence is labeled as not evidence. Investigate runs the LangGraph path for the selected intent. Graph off clears the path and hides guard, dismiss, escalate, and Investigate.

## Track

Track 01. Tracks 02 and 03 are not on the form until a second tenant, or author and past-decision hops, are in the video.

## Disclosure

Copy this into the form.

The pre-event scaffold was prepared with a coding agent before 15 October 2026. During Graph Hacks the extractor, the queries, the screen, and the LangGraph investigator were written with Cursor. Gemini Flash may draft one sentence after the tools return. It does not write Cypher, and a function name that was not in the tool payload is not stored. The author can explain the model and every query in [docs/queries.md](docs/queries.md).

FalkorDB is licensed under SSPLv1. This repository does not vendor the database.

The demo script is [docs/video-script.md](docs/video-script.md). A draft post is [docs/blog.md](docs/blog.md). Publish that post yourself and put the URL on the form. The form track is 01.
# falkordb_hackathon
