import assert from "node:assert/strict";
import test from "node:test";
import { clearHostPresent, listProviderEntries, markHostPresent } from "../src/host.ts";
import { createProviderRuntime, registerProvider } from "../src/provider.ts";
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

test("provider runtime isolates standalone sink mutations from updates and host publication", (t) => {
  clearProviderEntries();
  clearHostPresent();

  const widgetCalls: Array<string[] | undefined> = [];
  const runtime = createProviderRuntime({
    providerId: "mutating-sink-provider",
    widgetId: "mutating-sink-widget",
    sink: {
      setWidget: (_id, lines) => {
        widgetCalls.push(lines);
        lines?.splice(0, 1, "sink edit", "sink extra");
      },
    },
  });
  t.after(() => {
    runtime.stop();
    clearProviderEntries();
    clearHostPresent();
  });

  const updatedAt = "2026-06-15T12:00:00.000Z";
  const snapshot = runtime.update({ available: true, lines: ["original line"], updatedAt });
  assert.deepEqual(widgetCalls.at(-1), ["sink edit", "sink extra"]);

  markHostPresent();
  assert.deepEqual({ snapshot: snapshot.lines, published: listProviderEntries()[0]?.lines }, {
    snapshot: ["original line"],
    published: ["original line"],
  });

  clearHostPresent();
  assert.deepEqual(widgetCalls.at(-1), ["sink edit", "sink extra"]);
  const callsBeforeClear = widgetCalls.length;
  runtime.update({ available: false, lines: ["hidden line"], updatedAt });
  assert.deepEqual(widgetCalls.slice(callsBeforeClear), [undefined]);
});

test("registerProvider adapts array output and Date timestamps for runtime updates", () => {
  clearProviderEntries();
  clearHostPresent();

  const provider = registerProvider({
    id: "date-provider",
    getUpdatedAt: () => new Date("2026-06-15T12:00:00Z"),
    getRenderedLines: () => ["hello"],
  });

  markHostPresent();
  assert.deepEqual(listProviderEntries()[0], {
    providerId: "date-provider",
    available: true,
    lines: ["hello"],
    updatedAt: "2026-06-15T12:00:00.000Z",
    priority: 0,
    tags: undefined,
    mode: undefined,
    ttlMs: undefined,
  });

  provider.stop();
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

test("registerProvider reads callbacks and notifies host presence changes", () => {
  clearProviderEntries();
  clearHostPresent();

  const widgetCalls: Array<string[] | undefined> = [];
  const presenceChanges: boolean[] = [];
  let tags = ["sports", "idle"];
  let lines = ["Team A 2 - 1 Team B"];

  const provider = registerProvider({
    id: "pi-soccer-widget",
    widgetId: "widget-soccer",
    tags: () => tags,
    priority: 20,
    ttlMs: () => 60_000,
    getUpdatedAt: () => "2026-06-15T12:00:00.000Z",
    getRenderedLines: () => ({ available: true, lines }),
    onHostPresenceChange: (hostPresent) => {
      presenceChanges.push(hostPresent);
    },
    sink: {
      setWidget: (_id, rendered) => {
        widgetCalls.push(rendered ? [...rendered] : undefined);
      },
    },
  });

  assert.equal(provider.getMode(), "standalone");
  assert.deepEqual(widgetCalls.at(-1), lines);

  markHostPresent();
  assert.deepEqual(presenceChanges, [true]);
  assert.equal(provider.getMode(), "host-owned");
  assert.deepEqual(listProviderEntries()[0], {
    providerId: "pi-soccer-widget",
    available: true,
    lines,
    updatedAt: "2026-06-15T12:00:00.000Z",
    priority: 20,
    tags: ["sports", "idle"],
    mode: undefined,
    ttlMs: 60_000,
  });

  tags = ["sports", "matchday"];
  lines = ["Kickoff in 15m"];
  provider.refresh();
  assert.deepEqual(listProviderEntries()[0]?.tags, ["sports", "matchday"]);
  assert.deepEqual(listProviderEntries()[0]?.lines, lines);

  clearHostPresent();
  assert.deepEqual(presenceChanges, [true, false]);
  assert.equal(provider.getMode(), "standalone");
  assert.deepEqual(widgetCalls.at(-1), lines);

  provider.stop();
  clearProviderEntries();
  clearHostPresent();
});

test("registerProvider disposes presence listeners when the first refresh fails", (t) => {
  clearProviderEntries();
  clearHostPresent();
  t.after(() => {
    clearHostPresent();
    clearProviderEntries();
  });

  const error = new Error("initial render failed");
  const presenceChanges: boolean[] = [];
  const widgetCalls: Array<string[] | undefined> = [];

  assert.throws(() => registerProvider({
    id: "failed-provider",
    widgetId: "failed-widget",
    getUpdatedAt: () => "2026-06-15T12:00:00.000Z",
    getRenderedLines: () => {
      throw error;
    },
    onHostPresenceChange: (present) => presenceChanges.push(present),
    sink: {
      setWidget: (_id, lines) => widgetCalls.push(lines),
    },
  }), (thrown) => thrown === error);

  // Ignore setup and cleanup calls; transitions must not reach the failed provider.
  widgetCalls.length = 0;
  markHostPresent();
  clearHostPresent();
  assert.deepEqual({ presenceChanges, widgetCalls }, { presenceChanges: [], widgetCalls: [] });
});

test("provider runtime returns defensive snapshots of updates", () => {
  clearProviderEntries();
  clearHostPresent();

  const runtime = createProviderRuntime({ providerId: "snapshot-provider" });

  try {
    const returned = runtime.update({
      available: true,
      lines: ["original line"],
      updatedAt: "2026-06-15T12:00:00.000Z",
      tags: ["original tag"],
    });

    returned.providerId = "mutated-provider";
    returned.available = false;
    returned.lines[0] = "mutated line";
    returned.lines.push("extra line");
    returned.tags![0] = "mutated tag";
    returned.tags!.push("extra tag");

    markHostPresent();
    assert.deepEqual(listProviderEntries()[0], {
      providerId: "snapshot-provider",
      available: true,
      lines: ["original line"],
      updatedAt: "2026-06-15T12:00:00.000Z",
      priority: 0,
      tags: ["original tag"],
      mode: undefined,
      ttlMs: undefined,
    });

    const secondReturned = runtime.update({
      available: true,
      lines: ["second line"],
      updatedAt: "2026-06-15T12:01:00.000Z",
      tags: ["second tag"],
    });
    secondReturned.lines[0] = "also mutated";
    secondReturned.tags![0] = "also mutated";

    clearHostPresent();
    markHostPresent();
    assert.deepEqual(listProviderEntries()[0]?.lines, ["second line"]);
    assert.deepEqual(listProviderEntries()[0]?.tags, ["second tag"]);
  } finally {
    runtime.stop();
    clearProviderEntries();
    clearHostPresent();
  }
});

test("registered provider refresh returns defensive snapshots", () => {
  clearProviderEntries();
  clearHostPresent();

  const widgetCalls: Array<string[] | undefined> = [];
  const lines = ["original line"];
  const tags = ["original tag"];
  const provider = registerProvider({
    id: "refresh-snapshot-provider",
    tags: () => tags,
    getUpdatedAt: () => "2026-06-15T12:00:00.000Z",
    getRenderedLines: () => ({ available: true, lines }),
    widgetId: "refresh-snapshot-widget",
    sink: {
      setWidget: (_id, rendered) => {
        widgetCalls.push(rendered ? [...rendered] : undefined);
      },
    },
  });

  try {
    const returned = provider.refresh();
    returned.providerId = "mutated-provider";
    returned.available = false;
    returned.lines[0] = "mutated line";
    returned.lines.push("extra line");
    returned.tags![0] = "mutated tag";
    returned.tags!.push("extra tag");

    clearHostPresent();
    assert.deepEqual(widgetCalls.at(-1), ["original line"]);
    markHostPresent();
    assert.deepEqual(listProviderEntries()[0]?.lines, ["original line"]);
    assert.deepEqual(listProviderEntries()[0]?.tags, ["original tag"]);

    const refreshed = provider.refresh();
    assert.equal(refreshed.providerId, "refresh-snapshot-provider");
    assert.equal(refreshed.available, true);
    assert.deepEqual(refreshed.lines, ["original line"]);
    assert.deepEqual(refreshed.tags, ["original tag"]);

    refreshed.lines[0] = "mutated again";
    refreshed.tags![0] = "mutated again";
    clearHostPresent();
    assert.deepEqual(widgetCalls.at(-1), ["original line"]);
    markHostPresent();
    assert.deepEqual(listProviderEntries()[0]?.lines, ["original line"]);
    assert.deepEqual(listProviderEntries()[0]?.tags, ["original tag"]);
  } finally {
    provider.stop();
    clearProviderEntries();
    clearHostPresent();
  }
});
