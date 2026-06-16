import assert from "node:assert/strict";
import test from "node:test";
import { clearHostPresent, listProviderEntries, markHostPresent } from "../src/host.ts";
import { createProviderRuntime } from "../src/provider.ts";
import { clearProviderEntries } from "../src/protocol.ts";

test("provider runtime switches between standalone render and host-owned publish", () => {
  clearProviderEntries();
  clearHostPresent();

  const widgetCalls: Array<string[] | undefined> = [];
  const runtime = createProviderRuntime({
    providerId: "demo-provider",
    widgetId: "widget-demo",
    sink: {
      setWidget: (_id, lines) => {
        widgetCalls.push(lines ? [...lines] : undefined);
      },
    },
  });

  runtime.update({
    available: true,
    lines: ["hello"],
    updatedAt: "2026-06-15T12:00:00.000Z",
    tags: ["music"],
  });

  assert.deepEqual(listProviderEntries(), []);
  assert.deepEqual(widgetCalls.at(-1), ["hello"]);
  assert.equal(runtime.getMode(), "standalone");

  markHostPresent();
  assert.equal(runtime.getMode(), "host-owned");
  assert.equal(listProviderEntries()[0]?.providerId, "demo-provider");
  assert.equal(widgetCalls.at(-1), undefined);

  clearHostPresent();
  assert.equal(runtime.getMode(), "standalone");
  assert.deepEqual(listProviderEntries(), []);
  assert.deepEqual(widgetCalls.at(-1), ["hello"]);

  runtime.stop();
  clearProviderEntries();
  clearHostPresent();
});

test("provider runtime keeps unavailable state in host registry and clears standalone widget", () => {
  clearProviderEntries();
  clearHostPresent();

  let lastWidget: string[] | undefined;
  const runtime = createProviderRuntime({
    providerId: "demo-provider",
    widgetId: "widget-demo",
    sink: {
      setWidget: (_id, lines) => {
        lastWidget = lines ? [...lines] : undefined;
      },
    },
  });

  runtime.update({
    available: false,
    lines: [],
    updatedAt: "2026-06-15T12:00:00.000Z",
  });

  assert.equal(lastWidget, undefined);

  markHostPresent();
  assert.equal(listProviderEntries()[0]?.available, false);

  runtime.stop();
  clearProviderEntries();
  clearHostPresent();
});
