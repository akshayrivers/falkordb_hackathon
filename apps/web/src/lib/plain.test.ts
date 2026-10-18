import { describe, expect, it } from "vitest";

import { PLAIN_PROMPT } from "@/lib/plain";

describe("plain Gemini", () => {
  it("asks for a guess with no graph evidence in the prompt", () => {
    expect(PLAIN_PROMPT).toContain("no code graph");
    expect(PLAIN_PROMPT).not.toContain("safe_path_join");
    expect(PLAIN_PROMPT).not.toContain("store_file");
    expect(PLAIN_PROMPT).not.toContain("ac05d552");
    expect(PLAIN_PROMPT).not.toContain("MATCH");
  });
});
