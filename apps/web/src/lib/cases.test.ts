import { describe, expect, it } from "vitest";

import { parseRepoSource, slugify } from "@/lib/cases";

describe("repo sources", () => {
  it("accepts an https git URL and drops credentials and extra path", () => {
    const source = parseRepoSource("https://github.com/orhun/rustypaste/tree/master", "v0.18.0");
    expect(source).toMatchObject({
      kind: "git",
      url: "https://github.com/orhun/rustypaste.git",
      slug: "orhun-rustypaste",
      label: "orhun/rustypaste",
      ref: "v0.18.0",
    });
  });

  it("rejects a non-https URL and a host outside the allow list", () => {
    expect(() => parseRepoSource("http://github.com/orhun/rustypaste")).toThrow(/absolute path|https/);
    expect(() => parseRepoSource("https://example.com/orhun/rustypaste")).toThrow(/github.com/);
  });

  it("reads a GitHub file or tree link, and lets the tag box win", () => {
    const file = parseRepoSource("https://github.com/orhun/rustypaste/blob/v0.18.0/src/util.rs");
    expect(file).toMatchObject({
      kind: "git",
      url: "https://github.com/orhun/rustypaste.git",
      scope: "file",
      ref: "v0.18.0",
      path: "src/util.rs",
      host: "github.com",
    });
    const tree = parseRepoSource("https://github.com/orhun/rustypaste/tree/master/src", "v0.18.0");
    expect(tree).toMatchObject({ scope: "tree", ref: "v0.18.0", path: "src" });
    const raw = parseRepoSource("https://raw.githubusercontent.com/orhun/rustypaste/v0.18.0/src/util.rs");
    expect(raw).toMatchObject({ scope: "file", ref: "v0.18.0", path: "src/util.rs", host: "github.com" });
  });

  it("reads GitLab and Codeberg file links", () => {
    const gitlab = parseRepoSource("https://gitlab.com/group/sub/widget/-/blob/main/src/lib.rs");
    expect(gitlab).toMatchObject({
      url: "https://gitlab.com/group/sub/widget.git",
      scope: "file",
      ref: "main",
      path: "src/lib.rs",
      host: "gitlab.com",
    });
    const codeberg = parseRepoSource("https://codeberg.org/owner/widget/src/branch/main/src/lib.rs");
    expect(codeberg).toMatchObject({ scope: "file", ref: "main", path: "src/lib.rs", host: "codeberg.org" });
  });

  it("rejects a file link that is not Rust and a path that escapes", () => {
    expect(() => parseRepoSource("https://github.com/orhun/rustypaste/blob/master/README.md")).toThrow(/source file/);
    expect(() => parseRepoSource("https://github.com/example/app/blob/main/app.py")).not.toThrow();
    expect(parseRepoSource("https://github.com/example/app/blob/main/app.py")).toMatchObject({
      scope: "file",
      path: "app.py",
    });
    expect(() => parseRepoSource("https://github.com/orhun/rustypaste/blob/master/src/%2e%2e/secret.rs")).toThrow(
      /unsupported/,
    );
  });
  it("accepts an absolute crate path", () => {
    const source = parseRepoSource("/tmp/widget");
    expect(source).toMatchObject({ kind: "local", path: "/tmp/widget", slug: "widget" });
  });

  it("slugifies names into graph-safe ids", () => {
    expect(slugify("Orhun/Rusty Paste")).toBe("orhun-rusty-paste");
  });
});
