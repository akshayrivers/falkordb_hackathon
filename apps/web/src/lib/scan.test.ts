import { describe, expect, it } from "vitest";

import { scanSources } from "@/lib/scan";

describe("source scan", () => {
  it("links a python call to the function in the same file", () => {
    const corpus = scanSources(
      [{ file: "app.py", text: "class Box:\n    def ping(self):\n        self.pong()\n        print('x')\n\ndef pong():\n    return 1\n" }],
      "example/app",
      "main",
    );
    const ping = corpus.functions.find((fn) => fn.qual === "Box.ping");
    expect(ping?.line).toBe(2);
    expect(corpus.calls.find((call) => call.callerId === ping?.id)?.calleeName).toBe("self.pong");
    expect(corpus.functions.map((fn) => fn.name)).toContain("pong");
    expect(corpus.config.flags).toEqual([]);
  });

  it("orders javascript and go calls", () => {
    const js = scanSources(
      [{ file: "src/app.js", text: "function ping() {\n  pong();\n  console.log('a');\n}\nfunction pong() {}\n" }],
      "example/js",
      "main",
    );
    const ping = js.functions.find((fn) => fn.name === "ping");
    const calls = js.calls.filter((call) => call.callerId === ping?.id);
    expect(calls.map((call) => call.calleeName)).toEqual(["pong", "console.log"]);
    expect(calls[0]?.calleeId).toBe("src/app.js::pong");
    expect(calls[0]?.order).toBe(1);

    const go = scanSources(
      [{ file: "main.go", text: "func ping() {\n\tpong()\n}\n\nfunc pong() {\n}\n" }],
      "example/go",
      "main",
    );
    expect(go.functions.map((fn) => fn.name).sort()).toEqual(["ping", "pong"]);
    expect(go.calls[0]?.calleeId).toBe("main.go::pong");
  });
});
