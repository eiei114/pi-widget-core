import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const packageJson = JSON.parse(readFileSync(`${root}/package.json`, "utf8")) as { version: string };
const readme = readFileSync(`${root}/README.md`, "utf8");
const changelog = readFileSync(`${root}/CHANGELOG.md`, "utf8");

test("README pinned install example matches package.json version", () => {
  const match = readme.match(/npm install pi-widget-core@(\d+\.\d+\.\d+)/);
  assert.ok(match, "README should document a pinned install example");
  assert.equal(match[1], packageJson.version);
});

test("CHANGELOG documents the released package.json version", () => {
  const versionPattern = packageJson.version.replace(/\./g, "\\.");
  assert.match(
    changelog,
    new RegExp(`^## ${versionPattern}(?:\\s|$)`, "m"),
    "CHANGELOG should include a section for the current package.json version",
  );
});
