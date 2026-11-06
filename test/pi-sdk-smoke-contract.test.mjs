import assert from "node:assert/strict";
import test from "node:test";
import {
  behaviorAssertions, getSdkVersions, hasMalformedRpcStdout, parseJsonLines, smokeCasePassed,
  VERIFICATION_CONTRACT, SDK_PACKAGE_NAMES,
} from "../scripts/pi-sdk-smoke-contract.mjs";

const status = { type: "extension_ui_request", method: "setStatus", statusKey: "widget-core", statusText: "Pi widget core loaded" };
const prompt = { type: "response", command: "prompt", success: true, data: { disposition: "handled" } };
const entry = { providerId: "pi-widget-core-sdk-smoke", available: true, lines: ["widget core provider is live"] };
const notification = { type: "extension_ui_request", method: "notify", message: `pi-widget-core:${JSON.stringify(entry)}` };
const cleanOutput = "[pi-widget-core-smoke] clean_shutdown\n[pi-widget-core-smoke] clean_shutdown";
const piCodingAgentVersion = "fixture-sdk-version";
const observed = (responses = [status, prompt, notification], fullOutput = cleanOutput, exit_code = 0,
  processExited = true, firstProcessOutput = fullOutput, secondProcessOutput = fullOutput) =>
  ({ responses, fullOutput, exit_code, processExited, firstExitCode: exit_code,
    firstProcessExited: processExited, processCount: 2, firstProcessOutput, secondProcessOutput });

test("contract ID and JSON-lines parser handle LF/CRLF and blank lines", () => {
  assert.equal(VERIFICATION_CONTRACT, "pi-sdk-behavior-v2");
  assert.deepEqual(parseJsonLines(`${JSON.stringify(prompt)}\r\n\n`), [prompt]);
});

test("smoke expectations use exact SDK pins from package.json devDependencies", () => {
  const devDependencies = Object.fromEntries(SDK_PACKAGE_NAMES.map((name) => [name, "fixture-sdk-version"]));
  assert.deepEqual(getSdkVersions(devDependencies), devDependencies);
  assert.throws(() => getSdkVersions({ ...devDependencies, "@earendil-works/pi-ai": undefined }),
    /exact dev\/test pin for @earendil-works\/pi-ai/);
});

test("JSON-lines parser rejects non-empty malformed RPC stdout", () => {
  for (const malformed of ["not json", '{"truncated":']) {
    assert.throws(() => parseJsonLines(`${JSON.stringify(prompt)}\n${malformed}\n`), {
      name: "SyntaxError",
      message: /Invalid JSON in RPC stdout line 2/,
    });
  }
});

test("malformed stdout from the first reload process fails even when the second succeeds", () => {
  const firstProcess = { stdoutProtocolError: new SyntaxError("Invalid JSON in RPC stdout line 1") };
  const secondProcess = { stdoutProtocolError: undefined };
  const malformed = hasMalformedRpcStdout(firstProcess, secondProcess);

  assert.equal(malformed, true);
  assert.equal(smokeCasePassed({ processExited: true, exit_code: 0, hasUnhandledError: false,
    hasLoadError: false, hasMalformedRpcStdout: malformed, assertions: [{ passed: true }] }), false);
});

test("positive observations pass for extension load, feature, handled error, reload, and native shell", () => {
  const errorResponse = { type: "extension_ui_request", method: "notify", message: "pi-widget-core-error:providerId is required" };
  assert.equal(behaviorAssertions("extension_load", observed())[0].passed, true);
  assert.equal(behaviorAssertions("happy_path", observed())[0].passed, true);
  assert.equal(behaviorAssertions("error_path", observed([prompt, errorResponse]))[0].passed, true);
  assert.ok(behaviorAssertions("reload_cleanup", observed()).every((item) => item.passed));
  assert.equal(behaviorAssertions("host_shell", {
    ...observed([], `${piCodingAgentVersion}\r\n`), piCodingAgentVersion,
  })[0].passed, true);
});

test("missing or wrong feature responses fail positive and deliberately negative fixtures", () => {
  assert.equal(behaviorAssertions("happy_path", observed([]))[0].passed, false);
  for (const badEntry of [null, { ...entry, available: false }, { ...entry, lines: [] }, { ...entry, providerId: "other" }]) {
    const badNotification = { ...notification, message: `pi-widget-core:${JSON.stringify(badEntry)}` };
    assert.equal(behaviorAssertions("happy_path", observed([prompt, badNotification]))[0].passed, false);
  }

  const errorResponse = { type: "extension_ui_request", method: "notify", message: "pi-widget-core-error:providerId is required" };
  assert.equal(behaviorAssertions("error_path", observed([]))[0].passed, false);
  assert.equal(behaviorAssertions("error_path", observed([errorResponse]))[0].passed, false);
  assert.equal(behaviorAssertions("error_path", observed([prompt, { ...errorResponse, message: "wrong" }]))[0].passed, false);
});

test("reload requires the second host registration, real feature response, and disposal proof", () => {
  assert.deepEqual(behaviorAssertions("reload_cleanup", observed()).map((item) => item.id), [
    "reloaded_extension_registered", "reloaded_feature_response", "clean_shutdown",
  ]);
  for (const responses of [[], [prompt, notification], [status], [status, prompt], [status, notification]]) {
    assert.ok(behaviorAssertions("reload_cleanup", observed(responses)).some((item) => !item.passed));
  }
  assert.equal(behaviorAssertions("reload_cleanup", observed([status, prompt, notification], "", 0))[2].passed, false);
  assert.equal(behaviorAssertions("reload_cleanup", observed([status, prompt, notification], cleanOutput, 0, false))[2].passed, false);
  const firstProcessHasTwoMarkers = "[pi-widget-core-smoke] clean_shutdown\n".repeat(2);
  const secondProcessHasNone = "";
  const unevenCleanup = observed([status, prompt, notification], `${firstProcessHasTwoMarkers}${secondProcessHasNone}`,
    0, true, firstProcessHasTwoMarkers, secondProcessHasNone);
  assert.equal(behaviorAssertions("reload_cleanup", unevenCleanup)[2].passed, false);
});

test("host shell checks exact version, actual process exit, and extension load detects wrong registration", () => {
  for (const output of ["", "other-version", `${piCodingAgentVersion} but error`, "wrong-version"]) {
    assert.equal(behaviorAssertions("host_shell", {
      ...observed([], output), piCodingAgentVersion,
    })[0].passed, false);
  }
  assert.equal(behaviorAssertions("host_shell", {
    ...observed([], piCodingAgentVersion, 0, false), piCodingAgentVersion,
  })[0].passed, false);
  assert.equal(behaviorAssertions("extension_load", observed([{ ...status, statusKey: "other" }]))[0].passed, false);
});
