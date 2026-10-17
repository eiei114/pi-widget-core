import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export function previousPackageVersion(cwd = process.cwd()) {
  const currentVersion = JSON.parse(readFileSync(resolve(cwd, "package.json"), "utf8")).version;
  const revisions = execFileSync("git", ["log", "--format=%H", "--", "package.json"], {
    cwd, encoding: "utf8",
  }).trim().split(/\r?\n/).filter(Boolean);

  for (const revision of revisions) {
    const manifest = JSON.parse(execFileSync("git", ["show", `${revision}:package.json`], {
      cwd, encoding: "utf8",
    }));
    if (manifest.version !== currentVersion) return manifest.version ?? "";
  }
  return "";
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  process.stdout.write(previousPackageVersion());
}
