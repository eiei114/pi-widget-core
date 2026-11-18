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

test("async listener failures and logger failures do not interrupt dispatch", async () => {
  const registry = getWidgetHostRegistry();
  registry.clear();

  const originalConsoleError = console.error;
  const loggedErrors: unknown[][] = [];
  console.error = (...args: Parameters<typeof console.error>) => {
    loggedErrors.push(args);
  };

  const failure = new Error("async listener failed");
  const registryCalls: string[] = [];
  const disposeAsyncRegistry = registry.subscribe(async () => {
    registryCalls.push("async");
    throw failure;
  });
  const disposeRegistrySibling = registry.subscribe(() => {
    registryCalls.push("sibling");
  });

  const presenceCalls: string[] = [];
  const disposeAsyncPresence = subscribeToHostPresence(async (active) => {
    presenceCalls.push(`async:${active}`);
    throw failure;
  });
  const disposePresenceSibling = subscribeToHostPresence((active) => {
    presenceCalls.push(`sibling:${active}`);
  });

  try {
    assert.doesNotThrow(() => publishProviderEntry({
      providerId: "async",
      available: true,
      lines: ["async"],
      updatedAt: "2026-06-15T12:00:00.000Z",
    }));
    assert.deepEqual(registryCalls, ["async", "sibling"]);

    assert.doesNotThrow(() => setHostPresenceActive(true));
    assert.deepEqual(presenceCalls, ["async:true", "sibling:true"]);
    await Promise.resolve();

    assert.equal(loggedErrors.length, 2);
    for (const args of loggedErrors) {
      assert.equal(args[0], "[pi-widget-core] listener failed:");
      assert.equal(args[1], failure);
    }
  } finally {
    disposeAsyncRegistry();
    disposeRegistrySibling();
    disposeAsyncPresence();
    disposePresenceSibling();
    console.error = () => {
      throw new Error("logger failed");
    };
    const disposeThrowing = registry.subscribe(() => {
      throw failure;
    });
    const calls: string[] = [];
    const disposeLater = registry.subscribe(() => calls.push("later"));
    try {
      assert.doesNotThrow(() => publishProviderEntry({
        providerId: "logger",
        available: true,
        lines: ["logger"],
        updatedAt: "2026-06-15T12:00:00.000Z",
      }));
      assert.deepEqual(calls, ["later"]);
    } finally {
      disposeThrowing();
      disposeLater();
      console.error = originalConsoleError;
      clearProviderEntries();
      setHostPresenceActive(false);
    }
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

test("registry dispatch snapshots defer new listeners and skip disposed listeners", () => {
  const registry = getWidgetHostRegistry();
  registry.clear();

  const calls: string[] = [];
  let added = false;
  let disposeAdded = () => {};
  const disposeAdding = registry.subscribe(() => {
    calls.push("adding");
    if (!added) {
      added = true;
      disposeAdded = registry.subscribe(() => calls.push("added"));
    }
  });
  let disposeRemoved = () => {};
  const disposeRemoving = registry.subscribe(() => {
    calls.push("removing");
    disposeRemoved();
  });
  disposeRemoved = registry.subscribe(() => calls.push("removed"));
  const disposeSibling = registry.subscribe(() => calls.push("sibling"));

  try {
    publishProviderEntry({
      providerId: "first",
      available: true,
      lines: ["first"],
      updatedAt: "2026-06-15T12:00:00.000Z",
    });
    assert.deepEqual(calls, ["adding", "removing", "sibling"]);

    calls.length = 0;
    publishProviderEntry({
      providerId: "second",
      available: true,
      lines: ["second"],
      updatedAt: "2026-06-15T12:00:00.000Z",
    });
    assert.deepEqual(calls, ["adding", "removing", "sibling", "added"]);
  } finally {
    disposeAdding();
    disposeRemoving();
    disposeRemoved();
    disposeSibling();
    disposeAdded();
    clearProviderEntries();
  }
});

test("presence dispatch snapshots defer new listeners and skip disposed listeners", () => {
  setHostPresenceActive(false);

  const calls: string[] = [];
  let added = false;
  let disposeAdded = () => {};
  const disposeAdding = subscribeToHostPresence((active) => {
    calls.push(`adding:${active}`);
    if (!added) {
      added = true;
      disposeAdded = subscribeToHostPresence((nextActive) => calls.push(`added:${nextActive}`));
    }
  });
  let disposeRemoved = () => {};
  const disposeRemoving = subscribeToHostPresence((active) => {
    calls.push(`removing:${active}`);
    disposeRemoved();
  });
  disposeRemoved = subscribeToHostPresence((active) => calls.push(`removed:${active}`));
  const disposeSibling = subscribeToHostPresence((active) => calls.push(`sibling:${active}`));

  try {
    setHostPresenceActive(true);
    assert.deepEqual(calls, ["adding:true", "removing:true", "sibling:true"]);

    calls.length = 0;
    setHostPresenceActive(false);
    assert.deepEqual(calls, ["adding:false", "removing:false", "sibling:false", "added:false"]);
  } finally {
    disposeAdding();
    disposeRemoving();
    disposeRemoved();
    disposeSibling();
    disposeAdded();
    setHostPresenceActive(false);
  }
});
