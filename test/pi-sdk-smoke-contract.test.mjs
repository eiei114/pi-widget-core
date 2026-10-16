import assert from "node:assert/strict";
import test from "node:test";
import { behaviorAssertions, parseJsonLines, VERIFICATION_CONTRACT } from "../scripts/pi-sdk-smoke-contract.mjs";

const status = { type: "extension_ui_request", method: "setStatus", statusKey: "widget-core", statusText: "Pi widget core loaded" };
const prompt = { type: "response", command: "prompt", success: true, data: { disposition: "handled" } };
const entry = { providerId: "pi-widget-core-sdk-smoke", available: true, lines: ["widget core provider is live"] };
const notification = { type: "extension_ui_request", method: "notify", message: `pi-widget-core:${JSON.stringify(entry)}` };
const cleanOutput = "[pi-widget-core-smoke] clean_shutdown\n[pi-widget-core-smoke] clean_shutdown";
const observed = (responses = [status, prompt, notification], fullOutput = cleanOutput, exit_code = 0, processExited = true) =>
  ({ responses, fullOutput, exit_code, processExited, firstExitCode: exit_code,
    firstProcessExited: processExited, processCount: 2 });

test("contract ID and JSON-lines parser handle LF/CRLF and ignore non-JSON lines", () => {
  assert.equal(VERIFICATION_CONTRACT, "pi-sdk-behavior-v2");
  assert.deepEqual(parseJsonLines(`noise\r\n${JSON.stringify(prompt)}\n\n`), [prompt]);
});

test("positive observations pass for extension load, feature, handled error, reload, and native shell", () => {
  const errorResponse = { type: "extension_ui_request", method: "notify", message: "pi-widget-core-error:providerId is required" };
  assert.equal(behaviorAssertions("extension_load", observed())[0].passed, true);
  assert.equal(behaviorAssertions("happy_path", observed())[0].passed, true);
  assert.equal(behaviorAssertions("error_path", observed([prompt, errorResponse]))[0].passed, true);
  assert.ok(behaviorAssertions("reload_cleanup", observed()).every((item) => item.passed));
  assert.equal(behaviorAssertions("host_shell", observed([], "1.2.0\r\n"))[0].passed, true);
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
});

test("host shell checks exact version, actual process exit, and extension load detects wrong registration", () => {
  for (const output of ["", "11.2.0", "1.2.0 but error", "1.0.0"]) {
    assert.equal(behaviorAssertions("host_shell", observed([], output))[0].passed, false);
  }
  assert.equal(behaviorAssertions("host_shell", observed([], "1.2.0", 0, false))[0].passed, false);
  assert.equal(behaviorAssertions("extension_load", observed([{ ...status, statusKey: "other" }]))[0].passed, false);
});
