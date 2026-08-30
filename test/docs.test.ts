import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const packageJson = JSON.parse(readFileSync(`${root}/package.json`, "utf8")) as {
  version: string;
  engines?: { node?: string };
};
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

test("README subpath import overview avoids duplicate ProviderEntry imports", () => {
  const importOverview = readme.match(/Import the subpath that matches your role:[\s\S]*?```ts\n([\s\S]*?)```/);
  assert.ok(importOverview, "README should include the subpath import overview");

  const providerEntryReferences = importOverview[1].match(/\bProviderEntry\b/g) ?? [];
  assert.equal(
    providerEntryReferences.length,
    1,
    "subpath import overview should not declare ProviderEntry more than once when copied as one module",
  );
});

test("README Development documents package.json Node.js engine requirement", () => {
  const nodeEngine = packageJson.engines?.node;
  assert.ok(nodeEngine, "package.json should declare engines.node");

  const development = readme.match(/## Development[\s\S]*?(?=## |$)/);
  assert.ok(development, "README should include a Development section");

  const minimumMajor = nodeEngine.match(/(\d+)/)?.[1];
  assert.ok(minimumMajor, "engines.node should include a numeric minimum version");
  assert.match(
    development[0],
    new RegExp(`Node\\.js\\s+${minimumMajor}`, "i"),
    "Development section should document the Node.js engine requirement from package.json",
  );
});

test("README host quick start documents clearHostPresent alongside markHostPresent", () => {
  assert.match(readme, /mark\/clear host presence/i, "README features should mention mark/clear host presence");

  const hostExample = readme.match(/\*\*Widget host\*\*[\s\S]*?```ts([\s\S]*?)```/);
  assert.ok(hostExample, "README should include a widget host quick start");

  const example = hostExample[1];
  assert.match(example, /markHostPresent\(\)/, "host quick start should call markHostPresent()");
  assert.match(example, /clearHostPresent\(\)/, "host quick start should call clearHostPresent() on shutdown");
});
