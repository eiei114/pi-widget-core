import assert from "node:assert/strict";
import test from "node:test";
import {
  clearProviderEntries,
  getWidgetHostRegistry,
  normalizeProviderEntry,
  normalizeProviderId,
  publishProviderEntry,
  removeProviderEntry,
  setHostPresenceActive,
  subscribeToHostPresence,
} from "../src/protocol.ts";

test("registry publishes, dedupes, lists, and removes normalized entries", () => {
  const registry = getWidgetHostRegistry();
  registry.clear();

  let notifications = 0;
  const dispose = registry.subscribe(() => {
    notifications += 1;
  });

  registry.set({
    providerId: " demo ",
    available: true,
    lines: ["hello"],
    updatedAt: "2026-06-15T12:00:00.000Z",
    priority: 10,
    tags: ["music", " music "],
  });

  registry.set({
    providerId: "demo",
    available: true,
    lines: ["hello"],
    updatedAt: "2026-06-15T12:00:00.000Z",
    priority: 10,
    tags: ["music"],
  });

  assert.equal(notifications, 1);
  assert.deepEqual(registry.list()[0], {
    providerId: "demo",
    available: true,
    lines: ["hello"],
    updatedAt: "2026-06-15T12:00:00.000Z",
    priority: 10,
    tags: ["music"],
    mode: undefined,
    ttlMs: undefined,
  });

  registry.remove("demo");
  assert.equal(notifications, 2);
  assert.deepEqual(registry.list(), []);

  dispose();
  clearProviderEntries();
});

test("registry listener failures are logged without interrupting mutations or siblings", () => {
  const registry = getWidgetHostRegistry();
  registry.clear();

  const originalConsoleError = console.error;
  const loggedErrors: unknown[][] = [];
  console.error = (...args: Parameters<typeof console.error>) => {
    loggedErrors.push(args);
  };

  const calls: string[] = [];
  const failure = new Error("registry listener failed");
  const disposeThrowing = registry.subscribe(() => {
    calls.push("throwing");
    throw failure;
  });
  const disposeLater = registry.subscribe(() => {
    calls.push("later");
  });

  const entry = (providerId: string) => ({
    providerId,
    available: true,
    lines: [providerId],
    updatedAt: "2026-06-15T12:00:00.000Z",
  });

  try {
    assert.doesNotThrow(() => publishProviderEntry(entry("first")));
    assert.deepEqual(calls, ["throwing", "later"]);

    calls.length = 0;
    assert.doesNotThrow(() => removeProviderEntry("first"));
    assert.deepEqual(calls, ["throwing", "later"]);

    calls.length = 0;
    publishProviderEntry(entry("second"));
    calls.length = 0;
    assert.doesNotThrow(() => clearProviderEntries());
    assert.deepEqual(calls, ["throwing", "later"]);

    assert.equal(loggedErrors.length, 4);
    for (const args of loggedErrors) {
      assert.equal(args[0], "[pi-widget-core] listener failed:");
      assert.equal(args[1], failure);
    }
  } finally {
    disposeThrowing();
    disposeLater();
    console.error = originalConsoleError;
    clearProviderEntries();
  }
});

test("normalizeProviderId trims and rejects empty ids", () => {
  assert.equal(normalizeProviderId(" demo "), "demo");
  assert.throws(() => normalizeProviderId("   "), /providerId is required/);
  assert.throws(() => normalizeProviderId(""), /providerId is required/);
});

test("normalizeProviderEntry applies boundary normalization", () => {
  const normalized = normalizeProviderEntry({
    providerId: " provider ",
    available: true,
    lines: [1 as unknown as string, "two"],
    updatedAt: "2026-06-15T12:00:00Z",
    priority: Number.NaN,
    tags: [" music ", "music", ""],
    mode: "  evening ",
    ttlMs: 0,
  });

  assert.deepEqual(normalized, {
    providerId: "provider",
    available: true,
    lines: ["1", "two"],
    updatedAt: "2026-06-15T12:00:00.000Z",
    priority: 0,
    tags: ["music"],
    mode: "evening",
    ttlMs: undefined,
  });
});

test("host presence subscriptions fire only on changes", () => {
  setHostPresenceActive(false);
  const seen: boolean[] = [];
  const dispose = subscribeToHostPresence((active) => {
    seen.push(active);
  });

  setHostPresenceActive(true);
  setHostPresenceActive(true);
  setHostPresenceActive(false);

  dispose();
  assert.deepEqual(seen, [true, false]);
});

test("presence listener failures are logged without interrupting siblings or state changes", () => {
  setHostPresenceActive(false);

  const originalConsoleError = console.error;
  const loggedErrors: unknown[][] = [];
  console.error = (...args: Parameters<typeof console.error>) => {
    loggedErrors.push(args);
  };

  const calls: string[] = [];
  const failure = new Error("presence listener failed");
  const disposeThrowing = subscribeToHostPresence((active) => {
    calls.push(`throwing:${active}`);
    throw failure;
  });
  const disposeLater = subscribeToHostPresence((active) => {
    calls.push(`later:${active}`);
  });

  try {
    assert.doesNotThrow(() => setHostPresenceActive(true));
    assert.deepEqual(calls, ["throwing:true", "later:true"]);
    calls.length = 0;

    assert.doesNotThrow(() => setHostPresenceActive(false));
    assert.deepEqual(calls, ["throwing:false", "later:false"]);
    assert.equal(loggedErrors.length, 2);
    for (const args of loggedErrors) {
      assert.equal(args[0], "[pi-widget-core] listener failed:");
      assert.equal(args[1], failure);
    }
  } finally {
    disposeThrowing();
    disposeLater();
    console.error = originalConsoleError;
    setHostPresenceActive(false);
  }
});

test("self-unsubscribing listeners do not skip registry siblings", () => {
  const registry = getWidgetHostRegistry();
  registry.clear();

  const calls: string[] = [];
  let disposeSelf = () => {};
  disposeSelf = registry.subscribe(() => {
    calls.push("self");
    disposeSelf();
  });
  const disposeSibling = registry.subscribe(() => {
    calls.push("sibling");
  });

  try {
    publishProviderEntry({
      providerId: "first",
      available: true,
      lines: ["first"],
      updatedAt: "2026-06-15T12:00:00.000Z",
    });
    assert.deepEqual(calls, ["self", "sibling"]);

    calls.length = 0;
    publishProviderEntry({
      providerId: "second",
      available: true,
      lines: ["second"],
      updatedAt: "2026-06-15T12:00:00.000Z",
    });
    assert.deepEqual(calls, ["sibling"]);
  } finally {
    disposeSelf();
    disposeSibling();
    clearProviderEntries();
  }
});

test("self-unsubscribing presence listeners do not skip siblings", () => {
  setHostPresenceActive(false);

  const calls: string[] = [];
  let disposeSelf = () => {};
  disposeSelf = subscribeToHostPresence((active) => {
    calls.push(`self:${active}`);
    disposeSelf();
  });
  const disposeSibling = subscribeToHostPresence((active) => {
    calls.push(`sibling:${active}`);
  });

  try {
    setHostPresenceActive(true);
    assert.deepEqual(calls, ["self:true", "sibling:true"]);

    calls.length = 0;
    setHostPresenceActive(false);
    assert.deepEqual(calls, ["sibling:false"]);
  } finally {
    disposeSelf();
    disposeSibling();
    setHostPresenceActive(false);
  }
});
