import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import {
  behaviorAssertions, EXTENSION_LOAD_ERROR_PATTERN, parseJsonLines, SDK_VERSIONS,
  UNHANDLED_ERROR_PATTERN, VERIFICATION_CONTRACT,
} from "./pi-sdk-smoke-contract.mjs";

const root = resolve(import.meta.dirname, "..");
const reportPath = resolve(root, "docs/verification/pi-sdk-smoke.json");
const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));
const manifest = readJson(resolve(root, "package.json"));
const installedVersions = Object.fromEntries(Object.entries(SDK_VERSIONS).map(([name, expected]) => {
  const installed = readJson(resolve(root, "node_modules", name, "package.json")).version;
  if (manifest.devDependencies?.[name] !== expected || installed !== expected) {
    throw new Error(`Smoke requires the exact ${expected} dev/test pin for ${name}; installed ${installed}`);
  }
  return [name, installed];
}));
const piManifest = readJson(resolve(root, "node_modules/@earendil-works/pi-coding-agent/package.json"));
const piCli = resolve(root, "node_modules/@earendil-works/pi-coding-agent", piManifest.bin.pi);
const extensionPath = resolve(root, "test/fixtures/pi-sdk-smoke-extension.ts");
const agentDir = mkdtempSync(resolve(tmpdir(), "pi-widget-core-smoke-"));
const env = { ...process.env, PI_CODING_AGENT_DIR: agentDir };
const rpcArgs = [piCli, "--offline", "--no-session", "--no-tools", "--no-extensions", "--no-skills",
  "--no-context-files", "--no-prompt-templates", "--no-mcp", "-e", extensionPath, "--mode", "rpc"];
const promptInput = (message) => `${JSON.stringify({ type: "prompt", message })}\n`;

function run(name, executable, args, input) {
  const launch = () => {
    const result = spawnSync(executable, args, {
      cwd: root, env, input, encoding: "utf8", timeout: 15_000, windowsHide: true,
    });
    return {
      output: `${result.stdout ?? ""}${result.stderr ?? ""}${result.error ? `\n${result.error.message}` : ""}`,
      exit_code: result.status ?? 1,
      processExited: result.status !== null && result.status !== undefined && !result.error,
      responses: [...parseJsonLines(result.stdout ?? ""), ...parseJsonLines(result.stderr ?? "")],
    };
  };
  const firstProcess = launch();
  // A reload is proven by shutting down one real host and observing a fresh host.
  const result = name === "reload_cleanup" ? launch() : firstProcess;
  const fullOutput = name === "reload_cleanup"
    ? `--- first Pi process ---\n${firstProcess.output}\n--- second Pi process ---\n${result.output}`
    : result.output;
  const exit_code = result.exit_code;
  const processExited = result.processExited && (name !== "reload_cleanup" || firstProcess.processExited);
  const responses = result.responses;
  const assertions = behaviorAssertions(name, { responses, fullOutput, exit_code, processExited,
    firstExitCode: firstProcess.exit_code, firstProcessExited: firstProcess.processExited,
    processCount: name === "reload_cleanup" ? 2 : 1 });
  const hasUnhandledError = UNHANDLED_ERROR_PATTERN.test(fullOutput);
  const hasLoadError = EXTENSION_LOAD_ERROR_PATTERN.test(fullOutput);
  return {
    name,
    command: "npm run smoke:pi",
    exit_code,
    passed: processExited && exit_code === 0 && !hasUnhandledError && !hasLoadError && assertions.every((item) => item.passed),
    evidence: fullOutput.slice(-6000) || "No output captured",
    assertions,
    hasUnhandledError,
    hasLoadError,
  };
}

try {
  const cases = [
    run("extension_load", process.execPath, rpcArgs, promptInput("?widget-core")),
    run("happy_path", process.execPath, rpcArgs, promptInput("?widget-core")),
    run("error_path", process.execPath, rpcArgs, promptInput("?widget-core-invalid")),
    run("reload_cleanup", process.execPath, rpcArgs, promptInput("?widget-core")),
  ];

  if (process.platform === "win32") {
    const quote = (value) => `'${value.replaceAll("'", "''")}'`;
    const shell = resolve(process.env.SystemRoot ?? "C:/Windows", "System32/WindowsPowerShell/v1.0/powershell.exe");
    const shellCommand = `& ${quote(process.execPath)} ${quote(piCli)} --no-extensions --version; exit $LASTEXITCODE`;
    cases.push(run("host_shell", shell, ["-NoProfile", "-NonInteractive", "-Command", shellCommand], ""));
  } else {
    cases.push(run("host_shell", "/bin/sh", ["-c", '"$1" "$2" --no-extensions --version',
      "pi-widget-core-host-shell", process.execPath, piCli], ""));
  }

  const report = {
    schema_version: 1,
    verification_contract: VERIFICATION_CONTRACT,
    sdk_versions: installedVersions,
    platform: process.platform,
    model_inference: "none; actual Pi extension-handled RPC and provider-runtime paths",
    unhandled_errors: cases.filter((item) => item.hasUnhandledError).length,
    extension_load_errors: cases.filter((item) => item.hasLoadError
      || (item.name === "extension_load" && !item.passed)).length,
    cases: cases.map(({ hasUnhandledError, hasLoadError, ...item }) => item),
  };
  mkdirSync(dirname(reportPath), { recursive: true });
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({ verification_contract: VERIFICATION_CONTRACT, platform: process.platform,
    cases: cases.map(({ name, passed, exit_code }) => ({ name, passed, exit_code })) }));
  if (cases.some((item) => !item.passed)) process.exitCode = 1;
} finally {
  rmSync(agentDir, { recursive: true, force: true });
}
