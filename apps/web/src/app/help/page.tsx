import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Help · Sever",
  description: "Track 01: an agent that triages a security finding from a FalkorDB call graph.",
};

export default function HelpPage() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-10 px-4 py-8 sm:px-6">
      <header className="flex flex-col gap-3">
        <p className="text-sm font-medium text-muted-foreground">Track 01 · Agents that act on connected data</p>
        <h1 className="font-heading text-3xl font-semibold tracking-tight">One advisory is not one answer.</h1>
        <p className="text-sm leading-6 text-muted-foreground">
          Graph Hacks asks for an agent that follows connections, decides from what the graph shows, and can
          show the path behind the answer. Sever does that for a security triage. The case is rustypaste
          v0.18.0, issue 622. FalkorDB holds the calls, the config, the publish step, and the decision.
        </p>
      </header>

      <section className="flex flex-col gap-3">
        <h2 className="font-heading text-xl font-semibold">What this is</h2>
        <p className="text-sm leading-6">
          A triage view of a call graph. The graph is the evidence. A sentence from Gemini is not. The built-in
          case is rustypaste at tag v0.18.0. The covered path, the uncovered path, the config flag, and the
          Docker publish step are four different facts about the same advisory.
        </p>
        <ul className="flex list-disc flex-col gap-2 pl-5 text-sm leading-6">
          <li>
            <code>Paste::store_url</code> binds the filename header, then calls <code>safe_path_join</code> on
            line 346. That body is covered.
          </li>
          <li>
            <code>Paste::store_file</code> calls <code>safe_path_join</code> at order 28, line 180, and later
            calls <code>set_file_name</code> at order 41, line 214, inside the header binding. That body is
            uncovered.
          </li>
          <li>
            <code>server.auth_tokens</code> is commented out on line 13. An empty token set grants upload, so
            that flag enables <code>upload</code>.
          </li>
          <li>
            <code>.github/workflows/docker.yml</code> builds the image and ships <code>Paste::store_file</code>.
          </li>
        </ul>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-heading text-xl font-semibold">What the track asks for</h2>
        <p className="text-sm leading-6">
          Track 01 is an agent that uses the graph to decide and act. These are the five pieces, and where
          they are on the graph page.
        </p>
        <ul className="flex list-disc flex-col gap-2 pl-5 text-sm leading-6">
          <li>
            <span className="font-medium">Multi-hop reasoning.</span> Depth walks out from{" "}
            <code>upload</code>. The direct path to <code>set_file_name</code> is 2 hops. The path through
            the remote-file function is 3. Order 41 is a place in the body, not a hop count.
          </li>
          <li>
            <span className="font-medium">Graph queries and algorithms as tools.</span> The investigator
            calls locate, trace, cover, and walk. Those run <code>algo.bfs</code>, <code>algo.SPpaths</code>,
            and <code>algo.maxFlow</code>. It does not write its own Cypher.
          </li>
          <li>
            <span className="font-medium">Tool selection through MCP.</span> <code>/api/mcp</code> exposes
            walk, locate, trace, cover, and act. Investigate calls locate, then trace. Cover, walk, and act
            run only when that trace reached set_file_name, and act runs only when cover still returns the
            uncovered row.
          </li>
          <li>
            <span className="font-medium">An action from what the graph shows.</span> Guard, dismiss, or
            escalate is one write onto the uncovered function. The clerk cannot store a function name that
            was not in the tool result.
          </li>
          <li>
            <span className="font-medium">A path you can point at.</span> The four cards, the lit body, and
            the recorded step are the explanation. Graph off removes them, because the page does not keep a
            private copy of the verdict.
          </li>
        </ul>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-heading text-xl font-semibold">What it does</h2>
        <p className="text-sm leading-6">
          The graph page reads those facts back and lets you replay the body. Depth limits the walk from{" "}
          <code>upload</code>. The direct path to <code>set_file_name</code> is 2 hops. The path through the
          remote-file function is 3. Order 41 is the call&apos;s place in the body, not a hop count. Depth 1
          stops before that rename, so Investigate stores the step and does not guard. After a guard, the same
          cover query skips that row.
        </p>
        <ul className="flex list-disc flex-col gap-2 pl-5 text-sm leading-6">
          <li>Step and Play light the calls in order. The header rename is the uncovered row.</li>
          <li>Graph off hides the path and the guard, dismiss, and escalate buttons. The page does not invent a verdict while the database is off.</li>
          <li>Ask Gemini sends a prompt with no query results. The answer is labeled as not evidence.</li>
          <li>
            Investigate runs locate, cover, and trace. It stores a guard only when the walk reaches set_file_name
            and cover still returns the uncovered row. A sentence is stored only when every backtick name was
            already in the tool result.
          </li>
          <li>
            Another repository, folder, or source file can be added from a GitHub, GitLab, or Codeberg link, or
            from a local path. Those graphs get Calls and Reach. They do not get the issue 622 cards.
          </li>
        </ul>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-heading text-xl font-semibold">How it does it</h2>
        <ol className="flex list-decimal flex-col gap-3 pl-5 text-sm leading-6">
          <li>
            For a Rust crate, a syn visitor records each function and each call with its order and line. The
            rustypaste drawing is checked against that output before the graph is trusted.
          </li>
          <li>
            For Python, JavaScript, TypeScript, Go, Java, and the other parsed languages, Sever reads function
            definitions and the calls inside them. That picture is a call graph, not the issue 622 verdict.
          </li>
          <li>
            The rows are merged into FalkorDB. Reads are read-only queries. Recording guard, dismiss, or
            escalate is one write. The statements are fixed. There is no box for free Cypher.
          </li>
          <li>
            locate, trace, and cover answer the four facts. Each card names the query that produced it. Max flow
            runs on FLOW, one edge per pair, because three CALLS edges to set_file_name cannot sit in max flow.
            The investigator calls those tools. The clerk may ask Gemini Flash for one sentence, then drops the
            sentence if it names a function that was not in the payload. If the walk missed the rename, act is
            not called.
          </li>
          <li>
            The page draws what the graph returned. Turning the graph off does not open the database, so the
            path and the act buttons disappear.
          </li>
        </ol>
      </section>

      <p className="text-sm leading-6 text-muted-foreground">
        This entry is Track 01. The recorded decision stays in the FalkorDB graph for that case. A shared
        memory across several agents, and a graph of people and projects, are the other tracks.
      </p>
      <p className="text-sm leading-6">
        <a href="/" className="underline underline-offset-4">
          Open the graph
        </a>
      </p>
    </main>
  );
}
