import assert from "node:assert/strict";
import test from "node:test";
import {
  clearProviderEntries,
  getWidgetHostRegistry,
  normalizeProviderEntry,
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
