import { DEFAULT_DEPTH } from "@/lib/model";

export { DEFAULT_DEPTH };

// The direct walk upload → store_file → set_file_name is 2 relationships.
// upload → store_remote_file → store_file → set_file_name is 3.
// Order 41 is the header rename's place in the store_file body, not a hop count.
// maxLen 3 therefore keeps both walks. The default depth is 3.

export const indexFunction = "CREATE INDEX FOR (f:Function) ON (f.id)";
export const indexExternal = "CREATE INDEX FOR (e:External) ON (e.id)";

export const mergeFunctions = `
UNWIND $rows AS row
MERGE (f:Function {id: row.id})
SET f.name = row.name,
    f.qual = row.qual,
    f.file = row.file,
    f.line = row.line,
    f.headerOverrideLine = row.headerOverrideLine,
    f.repo = row.repo,
    f.tag = row.tag
`.trim();

export const mergeExternals = `
UNWIND $rows AS row
MERGE (e:External {id: row.id})
SET e.name = row.name,
    e.path = row.path
`.trim();

export const mergeCalls = `
UNWIND $rows AS row
MATCH (caller:Function {id: row.callerId})
MATCH (callee {id: row.calleeId})
MERGE (caller)-[c:CALLS {order: row.order}]->(callee)
SET c.line = row.line,
    c.insideHeaderOverride = row.insideHeaderOverride,
    c.weight = 1,
    c.capacity = 1
`.trim();

export const listFunctions = `
MATCH (f:Function)
WHERE f.repo = $repo
RETURN f.id AS id, f.name AS name, f.qual AS qual, f.file AS file, f.line AS line
ORDER BY f.file, f.line
`.trim();

export const mergeAdvisory = `
MERGE (a:Advisory {id: 'issue-622'})
SET a.issue = 622,
    a.title = $title,
    a.fix = 'ac05d552',
    a.repo = 'orhun/rustypaste',
    a.tag = 'v0.18.0'
WITH a
MATCH (sink:Function {id: $sinkId})
MATCH (san:Function {id: $sanId})
MERGE (a)-[s:SINKS]->(sink)
SET s.diff = 'src/paste.rs'
MERGE (a)-[z:SANITIZES]->(san)
SET z.diff = 'src/util.rs'
RETURN id(s) AS sinkEdge, id(z) AS sanitizerEdge
`.trim();

export const mergeEnables = `
MERGE (flag:ConfigFlag {id: 'server.auth_tokens'})
SET flag.table = 'server',
    flag.key = 'auth_tokens',
    flag.file = 'config.toml',
    flag.assigned = false,
    flag.line = $line
WITH flag
MATCH (entry:Function {id: $uploadId})
MERGE (flag)-[e:ENABLES]->(entry)
SET e.reason = 'missing auth_tokens grants Auth'
RETURN id(e) AS enablesEdge
`.trim();

// FalkorDB max-flow stores one tensor per relationship type and rejects
// parallel edges. store_file has three CALLS edges to set_file_name, so the
// check digit runs on FLOW: one edge per pair, capacity equal to the sum.
export const mergeFlow = `
MATCH (a)-[c:CALLS]->(b)
WHERE c.order >= 0
WITH a, b, sum(c.capacity) AS capacity
MERGE (a)-[f:FLOW]->(b)
SET f.capacity = capacity
`.trim();

export const mergeShips = `
MERGE (build:Build {id: 'docker-yml'})
SET build.file = '.github/workflows/docker.yml',
    build.dockerfile = 'Dockerfile'
WITH build
MATCH (sink:Function {id: $sinkId})
MERGE (build)-[sh:SHIPS]->(sink)
SET sh.tag = 'v0.18.0'
RETURN id(sh) AS shipsEdge
`.trim();

export const locate = `
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
`.trim();

export const coverUncovered = `
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
`.trim();

export const coverCovered = `
MATCH (fn:Function)-[san:CALLS]->(guard:Function {name: 'safe_path_join'})
WHERE fn.headerOverrideLine > 0 AND san.line > fn.headerOverrideLine AND san.order >= 0
OPTIONAL MATCH (fn)-[bad:CALLS]->(callee {name: 'set_file_name'})
WHERE bad.insideHeaderOverride = 1 AND bad.order >= 0
WITH fn, san, bad
WHERE bad IS NULL
RETURN fn.id AS id, fn.qual AS qual, fn.name AS name, san.line AS guardLine, san.order AS guardOrder
`.trim();

export const countRenames = `
MATCH (fn:Function {id: $id})-[c:CALLS]->(callee {name: 'set_file_name'})
WHERE c.order >= 0
RETURN count(c) AS calls
`.trim();

export const bodyCalls = `
MATCH (fn:Function {id: $id})-[c:CALLS]->(callee)
WHERE c.order >= 0
RETURN callee.id AS id,
       callee.name AS name,
       c.order AS order,
       c.line AS line,
       c.insideHeaderOverride AS insideHeaderOverride
ORDER BY c.order
`.trim();

export const reachCalls = `
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
`.trim();

export const bfs = `
MATCH (start:Function {id: $startId})
CALL algo.bfs(start, $depth, 'CALLS') YIELD nodes, edges
UNWIND nodes AS node
WITH node, edges
WHERE node.name IS NOT NULL
RETURN node.name AS name, node.id AS id, size(edges) AS edgeCount
`.trim();

export const shortest = `
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
`.trim();

export const maxFlow = `
MATCH (start:Function {id: $startId})
MATCH (sink:External {id: $sinkId})
CALL algo.maxFlow({
  sourceNodes: [start],
  targetNodes: [sink],
  relationshipTypes: ['FLOW'],
  capacityProperty: 'capacity'
}) YIELD maxFlow
RETURN maxFlow
`.trim();

export const writeStep = `
CREATE (run:Run {id: $runId, tenant: $tenant, intent: $intent})-[:HAS]->(step:Step {id: $stepId, reasoning: $reasoning, at: $at})
WITH run, step
MATCH (target:Function {id: $targetId})
CREATE (step)-[found:FOUND {role: 'uncovered'}]->(target)
RETURN step.id AS stepId, found.role AS role
`.trim();

export const guardMark = `
MATCH (fn:Function {id: $id})
OPTIONAL MATCH (:Step)-[guarded:DECIDED]->(fn)
WHERE guarded.kind = 'guard'
RETURN guarded.kind AS kind
LIMIT 1
`.trim();

export const latestStep = `
MATCH (run:Run {tenant: $tenant})-[:HAS]->(step:Step)
OPTIONAL MATCH (step)-[decided:DECIDED]->(target)
RETURN decided.kind AS kind,
       step.decision AS decision,
       target.qual AS qual,
       step.reasoning AS reasoning,
       step.at AS at
ORDER BY coalesce(step.at, 0) DESC
LIMIT 1
`.trim();

export const act = `
MATCH (run:Run {id: $runId, tenant: $tenant})-[:HAS]->(step:Step {id: $stepId})
MATCH (step)-[found:FOUND]->(target)
WHERE found.role = 'uncovered'
  AND ($decision = 'guard' OR $decision = 'dismiss' OR $decision = 'escalate')
MERGE (step)-[decided:DECIDED]->(target)
SET decided.kind = $decision, step.decision = $decision, step.reasoning = $reasoning
RETURN step.id AS stepId, decided.kind AS kind, target.id AS targetId
`.trim();

export const writeFindings = `
MATCH (run:Run {id: $runId, tenant: $tenant})
UNWIND $rows AS row
MERGE (finding:Finding {id: row.id})
SET finding.kind = row.kind, finding.tenant = $tenant, finding.detail = row.detail
MERGE (run)-[:HAS]->(finding)
WITH finding, row
MATCH (target {id: row.targetId})
MERGE (finding)-[found:FOUND {role: row.kind}]->(target)
RETURN finding.kind AS kind, found.role AS role
`.trim();
