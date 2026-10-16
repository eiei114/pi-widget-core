import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { previousPackageVersion } from "../scripts/previous-package-version.mjs";

test("finds the prior package version after multiple later commits", () => {
  const repo = mkdtempSync(join(tmpdir(), "pi-widget-core-release-history-"));
  const git = (args) => execFileSync("git", args, { cwd: repo, stdio: "ignore" });
  const commit = (message, files) => {
    for (const [path, contents] of Object.entries(files)) writeFileSync(join(repo, path), contents);
    git(["add", ...Object.keys(files)]);
    git(["commit", "--quiet", "-m", message]);
  };

  try {
    git(["init", "--quiet"]);
    git(["config", "user.name", "Version History Test"]);
    git(["config", "user.email", "version-history@example.test"]);
    commit("initial version", { "package.json": JSON.stringify({ name: "fixture", version: "0.1.9" }) });
    commit("bump version", { "package.json": JSON.stringify({ name: "fixture", version: "0.1.10" }) });
    commit("package metadata update", {
      "package.json": JSON.stringify({ name: "fixture", version: "0.1.10", description: "updated" }),
    });
    commit("follow-up one", { "README.md": "first follow-up\n" });
    commit("follow-up two", { "README.md": "second follow-up\n" });

    assert.equal(previousPackageVersion(repo), "0.1.9");
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});
