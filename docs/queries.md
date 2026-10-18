# Queries

The graph key is `sever`. Reads go through `GRAPH.RO_QUERY` (`graph.roQuery`). The act write is one `GRAPH.QUERY`. FalkorDB is SSPLv1 and is not vendored here.

`Paste::store_file` has three `CALLS` edges to the same `set_file_name` node. Their `order` values are 39, 41, and 56. Order 41 is the call inside the `header_filename` binding, on line 214. That order is the position in the function body. It is not a hop count.

The walk `upload → store_file → set_file_name` is 2 relationships. `upload → store_remote_file → store_file → set_file_name` is 3. `algo.SPpaths` `maxLen` 3 keeps both. The screen's default depth is 3.

## Relationship alias

Those three edges share a type and a pair of endpoints. A query that wants the order has to bind the relationship and use the alias. `c.order`, `count(c)`, and `id(s)` are that use. `count(c)` on `store_file`'s renames is 3. Dropping the alias would leave the three orders unread.

## Locate

`SINKS` points at `Paste::store_file`. `SANITIZES` points at `safe_path_join`. Both functions are in fix `ac05d552`, which edits `src/paste.rs` and `src/util.rs`. `ENABLES` runs from the unassigned `server.auth_tokens` key to `upload`. `SHIPS` runs from `.github/workflows/docker.yml` to `Paste::store_file`.

```
MATCH (a:Advisory {id: 'issue-622'})-[s:SINKS]->(sink:Function)
MATCH (a)-[z:SANITIZES]->(san:Function)
MATCH (flag:ConfigFlag)-[e:ENABLES]->(entry:Function)
MATCH (build:Build)-[sh:SHIPS]->(shipped:Function)
WHERE id(s) >= 0 AND id(z) >= 0 AND id(e) >= 0 AND id(sh) >= 0
RETURN sink.qual AS sinkQual,
       san.qual AS sanQual,
       flag.key AS flagKey,
       flag.table AS flagTable,
       flag.assigned AS flagAssigned,
       flag.line AS flagLine,
       entry.name AS entryName,
       build.file AS buildFile,
       shipped.qual AS shippedQual
```

## Cover

Uncovered means a `set_file_name` call inside the header binding has a greater `order` than the last `safe_path_join` in that same body. A function that already has a `DECIDED` edge of kind `guard` is skipped. Dismiss and escalate do not match that filter, so the row stays.

```
MATCH (fn:Function)-[bad:CALLS]->(callee {name: 'set_file_name'})
WHERE bad.insideHeaderOverride = 1 AND bad.order >= 0
MATCH (fn)-[san:CALLS]->(guard:Function {name: 'safe_path_join'})
WHERE san.order >= 0
WITH fn, bad, callee.name AS sinkCall, max(san.order) AS guardOrder, max(san.line) AS guardLine
WHERE bad.order > guardOrder
OPTIONAL MATCH (decidedStep:Step)-[guarded:DECIDED]->(fn)
WHERE guarded.kind = 'guard'
WITH fn, bad, sinkCall, guardOrder, guardLine, guarded
WHERE guarded IS NULL
RETURN fn.id AS id,
       fn.qual AS qual,
       fn.name AS name,
       sinkCall,
       bad.line AS sinkLine,
       bad.order AS sinkOrder,
       guardOrder,
       guardLine
```

Covered means the header binding's line is before `safe_path_join`, and that body has no header `set_file_name`.

```
MATCH (fn:Function)-[san:CALLS]->(guard:Function {name: 'safe_path_join'})
WHERE fn.headerOverrideLine > 0 AND san.line > fn.headerOverrideLine AND san.order >= 0
OPTIONAL MATCH (fn)-[bad:CALLS]->(callee {name: 'set_file_name'})
WHERE bad.insideHeaderOverride = 1 AND bad.order >= 0
WITH fn, san, bad
WHERE bad IS NULL
RETURN fn.id AS id, fn.qual AS qual, fn.name AS name, san.line AS guardLine, san.order AS guardOrder
```

The three renames stay visible only because `c` is referenced:

```
MATCH (fn:Function {id: $id})-[c:CALLS]->(callee {name: 'set_file_name'})
WHERE c.order >= 0
RETURN count(c) AS calls
```

The body replay uses the same alias:

```
MATCH (fn:Function {id: $id})-[c:CALLS]->(callee)
WHERE c.order >= 0
RETURN callee.id AS id,
       callee.name AS name,
       c.order AS order,
       c.line AS line,
       c.insideHeaderOverride AS insideHeaderOverride
ORDER BY c.order
```

## algo.bfs

Depth is the third argument. The relationship filter is `CALLS`. `edges` is referenced so the yield is not dropped.

```
MATCH (start:Function {id: $startId})
CALL algo.bfs(start, $depth, 'CALLS') YIELD nodes, edges
UNWIND nodes AS node
WITH node, edges
WHERE node.name IS NOT NULL
RETURN node.name AS name, node.id AS id, size(edges) AS edgeCount
```

## algo.SPpaths

`weight` is 1 on every `CALLS` edge. `maxLen` is the depth control. At depth 3 the direct path's weight is 2.

```
MATCH (start:Function {id: $startId})
MATCH (sink:External {id: $sinkId})
CALL algo.SPpaths({
  sourceNode: start,
  targetNode: sink,
  relTypes: ['CALLS'],
  weightProp: 'weight',
  maxLen: $depth,
  relDirection: 'outgoing',
  pathCount: 1
}) YIELD path, pathWeight, pathCost
RETURN pathWeight, pathCost
```

## algo.maxFlow

`capacity` is 1 on every `CALLS` edge. `algo.maxFlow` rejects a relationship type that has more than one edge between the same pair, and `store_file` has three `CALLS` edges to `set_file_name`. The check digit therefore runs on `FLOW`, which is one edge per pair whose capacity is the sum of those parallel edges. The order comparison stays on `CALLS`.

```
MATCH (start:Function {id: $startId})
MATCH (sink:External {id: $sinkId})
CALL algo.maxFlow({
  sourceNodes: [start],
  targetNodes: [sink],
  relationshipTypes: ['FLOW'],
  capacityProperty: 'capacity'
}) YIELD maxFlow
RETURN maxFlow
```

## Act

Guard, dismiss, and escalate are one statement. `found.role` and `decided.kind` reference the relationship aliases. Reasoning is written only after every backtick name in it appears in the tool payload. A name that does not is rejected before this query runs.

```
MATCH (run:Run {id: $runId, tenant: $tenant})-[:HAS]->(step:Step {id: $stepId})
MATCH (step)-[found:FOUND]->(target)
WHERE found.role = 'uncovered'
  AND ($decision = 'guard' OR $decision = 'dismiss' OR $decision = 'escalate')
MERGE (step)-[decided:DECIDED]->(target)
SET decided.kind = $decision, step.decision = $decision, step.reasoning = $reasoning
RETURN step.id AS stepId, decided.kind AS kind, target.id AS targetId
```

Run and Step live in this same graph. `reasoning` is a property on Step. `FOUND` points at `Paste::store_file`.

## Guard mark

The uncovered card stays guarded while any `DECIDED` edge of kind `guard` points at `Paste::store_file`. A later dismiss does not remove that edge.

```
MATCH (fn:Function {id: $id})
OPTIONAL MATCH (:Step)-[guarded:DECIDED]->(fn)
WHERE guarded.kind = 'guard'
RETURN guarded.kind AS kind
LIMIT 1
```

## Latest step

The page reads the newest Step for the rustypaste tenant. `at` is written with the step so the order is the write time.

```
MATCH (run:Run {tenant: $tenant})-[:HAS]->(step:Step)
OPTIONAL MATCH (step)-[decided:DECIDED]->(target)
RETURN decided.kind AS kind,
       step.decision AS decision,
       target.qual AS qual,
       step.reasoning AS reasoning,
       step.at AS at
ORDER BY coalesce(step.at, 0) DESC
LIMIT 1
```

## Another repo

A crate that is not rustypaste is loaded into its own graph. `listFunctions` lists that crate's functions. It does not attach issue 622.

```
MATCH (f:Function)
WHERE f.repo = $repo
RETURN f.id AS id, f.name AS name, f.qual AS qual, f.file AS file, f.line AS line
ORDER BY f.file, f.line
```

`reachCalls` is the second lens. It keeps the next ordered call after each direct callee. Depth 1 does not ask for it. It does not attach issue 622.

```
MATCH (fn:Function {id: $id})-[c:CALLS]->(mid)-[c2:CALLS]->(next)
WHERE c.order >= 0 AND c2.order >= 0
RETURN mid.id AS sourceId,
       mid.name AS sourceName,
       next.id AS id,
       next.name AS name,
       c2.order AS order,
       c2.line AS line
ORDER BY c.order, c2.order
LIMIT 60
```

