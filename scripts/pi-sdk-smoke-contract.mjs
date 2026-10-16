export const VERIFICATION_CONTRACT = "pi-sdk-behavior-v2";
export const SDK_VERSIONS = {
  "@earendil-works/pi-agent-core": "1.2.0",
  "@earendil-works/pi-ai": "1.2.0",
  "@earendil-works/pi-coding-agent": "1.2.0",
  "@earendil-works/pi-tui": "1.2.0",
};
export const EXTENSION_LOAD_ERROR_PATTERN = /Failed to load extension|Error loading extension/i;
export const UNHANDLED_ERROR_PATTERN = /UnhandledPromiseRejection|uncaught exception|shutdown error/i;

export function parseJsonLines(output) {
  return output.split(/\r?\n/).flatMap((line) => {
    if (!line.trim()) return [];
    try {
      return [JSON.parse(line)];
    } catch {
      return [];
    }
  });
}

function assertion(id, expected, observed, passed) {
  return { id, expected, observed: JSON.stringify(observed), passed: passed === true };
}

function promptResponse(responses) {
  return responses.find((row) => row?.type === "response" && row.command === "prompt");
}

function featureNotification(responses) {
  return responses.find((row) => row?.type === "extension_ui_request" && row.method === "notify"
    && typeof row.message === "string" && row.message.startsWith("pi-widget-core:"));
}

function handled(prompt) {
  return prompt?.success === true && prompt.data?.disposition === "handled";
}

export function behaviorAssertions(name, {
  responses, fullOutput, exit_code, processExited, firstExitCode = exit_code,
  firstProcessExited = processExited, processCount = 1,
}) {
  const status = responses.find((row) => row?.type === "extension_ui_request"
    && row.method === "setStatus" && row.statusKey === "widget-core"
    && row.statusText === "Pi widget core loaded");
  const prompt = promptResponse(responses);
  const notification = featureNotification(responses);
  const cleanupMarkerCount = (fullOutput.match(/\[pi-widget-core-smoke\] clean_shutdown/g) ?? []).length;
  const cleanShutdown = cleanupMarkerCount >= processCount
    && !UNHANDLED_ERROR_PATTERN.test(fullOutput);

  if (name === "extension_load") {
    return [assertion("extension_registered", "Actual Pi emits the widget-core session-start status", status ?? null, !!status)];
  }
  if (name === "happy_path") {
    let entry;
    try {
      entry = notification ? JSON.parse(notification.message.slice("pi-widget-core:".length)) : null;
    } catch {
      entry = null;
    }
    const expected = { providerId: "pi-widget-core-sdk-smoke", available: true, lines: ["widget core provider is live"] };
    return [assertion("feature_response", "The handled Pi input reports the live normalized core provider entry",
      { prompt: prompt ?? null, entry: entry ?? null }, handled(prompt) && entry?.providerId === expected.providerId
        && entry?.available === expected.available && JSON.stringify(entry?.lines) === JSON.stringify(expected.lines))];
  }
  if (name === "error_path") {
    const errorNotification = responses.find((row) => row?.type === "extension_ui_request" && row.method === "notify"
      && row.message === "pi-widget-core-error:providerId is required");
    return [assertion("handled_error", "Invalid provider ID is rejected by core and handled by the actual Pi extension",
      { prompt: prompt ?? null, errorNotification: errorNotification ?? null }, handled(prompt) && !!errorNotification)];
  }
  if (name === "reload_cleanup") {
    let entry;
    try {
      entry = notification ? JSON.parse(notification.message.slice("pi-widget-core:".length)) : null;
    } catch {
      entry = null;
    }
    return [
      assertion("reloaded_extension_registered", "The second Pi process emits the widget-core session-start status", status ?? null, !!status),
      assertion("reloaded_feature_response", "The second Pi process handles input and reports the live provider entry",
        { prompt: prompt ?? null, entry: entry ?? null }, handled(prompt) && entry?.providerId === "pi-widget-core-sdk-smoke"
          && entry?.available === true && JSON.stringify(entry?.lines) === JSON.stringify(["widget core provider is live"])),
      assertion("clean_shutdown", "The second process exits after disposing the provider without shutdown errors",
        { first_exit_code: firstExitCode, first_process_exited: firstProcessExited, exit_code, processExited,
          processCount, cleanupMarkerCount, shutdownErrors: UNHANDLED_ERROR_PATTERN.test(fullOutput) },
        firstExitCode === 0 && firstProcessExited && exit_code === 0 && processExited
          && processCount === 2 && cleanShutdown),
    ];
  }
  if (name === "host_shell") {
    return [assertion("native_shell_boundary", "Native host shell launches local Pi CLI and prints its exact SDK version",
      { exit_code, output: fullOutput.trim(), expectedVersion: SDK_VERSIONS["@earendil-works/pi-coding-agent"] },
      exit_code === 0 && processExited && fullOutput.trim() === SDK_VERSIONS["@earendil-works/pi-coding-agent"])];
  }
  throw new Error(`Unknown smoke case: ${name}`);
}
