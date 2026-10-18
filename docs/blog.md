# One advisory, four answers

I kept losing the rustypaste bug when I tried to say it as one sentence. Issue 622 is a path traversal through the filename header. That sentence is true and it is not the whole finding.

`Paste::store_url` binds the header, then calls `safe_path_join`. That body is covered. `Paste::store_file` calls `safe_path_join` at order 28, line 180, and later calls `set_file_name` at order 41, line 214, inside the same header binding. That body is uncovered. The fix is commit `ac05d552`, and it only touches `src/paste.rs` and `src/util.rs`, so those are the only functions the advisory edges point at.

The shipped `config.toml` comments out `server.auth_tokens`. When that set is empty, upload is allowed. That is one `ENABLES` edge, from that key, not from a key named uploads. The Docker workflow builds `Dockerfile` and pushes on version tags. That workflow ships the uncovered function.

Order 41 is the call's place in the function body. It is not a hop count. The walk from `upload` to `set_file_name` is two `CALLS` edges. A third hop appears if the request goes through `store_remote_file`. Depth 3 keeps both. There are three `CALLS` edges from `store_file` to the same `set_file_name` node, so a query that wants the order has to name the relationship. FalkorDB's max-flow procedure rejects those parallel edges, so the check digit runs on one `FLOW` edge per pair. The order comparison stays on `CALLS`.

The act is one write: guard, dismiss, or escalate. The reasoning on that step can mention a function only when the tool payload already returned that name. Turning FalkorDB off removes the path and the act button. A sentence from a model is not a substitute for that path.

I wrote the extractor, the queries, and the screen during Graph Hacks with Cursor. Gemini Flash, when the API key is present, may draft the one sentence the clerk stores. It does not choose the query, and a name it invents is not stored. FalkorDB is SSPLv1 and is not vendored in the repo. I can explain every query in `docs/queries.md` without reading this post back.
