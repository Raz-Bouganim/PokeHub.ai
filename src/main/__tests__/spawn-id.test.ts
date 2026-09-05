import { homedir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { normalizeCwd, slug } from "../spawn-id.ts";

describe("slug", () => {
  it("lowercases and collapses non-alphanumerics to a single dash", () => {
    expect(slug("Rowan")).toBe("rowan");
    expect(slug("Prof. Oak's Lab")).toBe("prof-oak-s-lab");
  });

  it("trims leading and trailing dashes", () => {
    expect(slug("  !Rowan!  ")).toBe("rowan");
  });

  it("falls back to 'agent' when nothing usable remains", () => {
    expect(slug("")).toBe("agent");
    expect(slug("---")).toBe("agent");
    expect(slug("🙂")).toBe("agent");
  });
});

describe("normalizeCwd", () => {
  it("trims stray whitespace", () => {
    expect(normalizeCwd("  /repo/app  ")).toBe("/repo/app");
  });

  it("expands a bare ~", () => {
    expect(normalizeCwd("~")).toBe(homedir());
    expect(normalizeCwd("  ~ ")).toBe(homedir());
  });

  it("expands a leading ~/", () => {
    expect(normalizeCwd("~/code/pokehub")).toBe(join(homedir(), "code/pokehub"));
  });

  it("leaves an absolute path untouched", () => {
    expect(normalizeCwd("/Users/x/code")).toBe("/Users/x/code");
  });

  it("does not expand a tilde that isn't leading", () => {
    expect(normalizeCwd("/repo/~backup")).toBe("/repo/~backup");
  });
});
