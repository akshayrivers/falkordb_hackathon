# Two-minute script

Record this from the local app at http://127.0.0.1:4317 before adding more features. Track 01 only. Speak the queries from `docs/queries.md` if you are asked; this script is the order, not a substitute for knowing them.

1. **Plain Gemini.** Click Ask Gemini. Say that this sentence had no graph, no line numbers, and no function names from the tool payload. It is not evidence.
2. **Locate.** Point at the four cards. `SINKS` is `Paste::store_file`. `SANITIZES` is `safe_path_join`. `ENABLES` is the commented-out `server.auth_tokens` key, which grants `Auth` when the set is empty. `SHIPS` is `.github/workflows/docker.yml`.
3. **Ordered calls.** Press Step. Order 28, line 180, is `safe_path_join`. Order 41, line 214, is `set_file_name` inside the header binding. Those orders are places in one function body. The walk from `upload` to `set_file_name` is 2 hops. Depth 3 also keeps the 3-hop walk through `store_remote_file`.
4. **Cover.** `Paste::store_url` binds the header and then calls `safe_path_join` on line 346. That body is covered. `Paste::store_file` checks first and renames later. That body is uncovered. `count` of the rename edges is 3 because the relationship alias is referenced.
5. **Act.** Investigate with intent `both`. The clerk stores `guard` only after every backtick name was in the tool payload. `FOUND` points at `Paste::store_file`. Reasoning is a property on `Step`.
6. **Graph off.** Turn the graph off. The four cards, the path, and guard, dismiss, and escalate disappear. The Gemini sentence can stay, labeled as not evidence.
