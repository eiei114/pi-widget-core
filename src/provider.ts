import {
  isHostPresent,
  normalizeProviderEntry,
  publishProviderEntry,
  removeProviderEntry,
  subscribeToHostPresence,
  type ProviderEntry,
} from "./protocol.ts";

export type { ProviderEntry, WidgetHostRegistry } from "./protocol.ts";

export interface WidgetSink {
  setWidget: (id: string, lines: string[] | undefined) => void;
}

export interface ProviderRuntimeOptions {
  providerId: string;
  widgetId?: string;
  sink?: WidgetSink;
}

export interface ProviderRuntimeUpdate extends Omit<ProviderEntry, "providerId"> {
  providerId?: string;
}

export type ProviderDisplayMode = "host-owned" | "standalone";

export interface ProviderRuntime {
  update: (entry: ProviderRuntimeUpdate) => ProviderEntry;
  stop: () => void;
  getMode: () => ProviderDisplayMode;
  isHostPresent: () => boolean;
}

export type ProviderRenderedState = string[] | { available: boolean; lines: string[] };

export type ProviderOptionValue<T> = T | (() => T);

export interface RegisterProviderOptions {
  id: string;
  tags?: ProviderOptionValue<string[] | undefined>;
  priority?: ProviderOptionValue<number | undefined>;
  ttlMs?: ProviderOptionValue<number | undefined>;
  getUpdatedAt: () => string | Date;
  getRenderedLines: () => ProviderRenderedState;
  onHostPresenceChange?: (hostPresent: boolean) => void;
  widgetId?: string;
  sink?: WidgetSink;
}

export interface RegisteredProvider {
  refresh: () => ProviderEntry;
  stop: () => void;
  getMode: () => ProviderDisplayMode;
  isHostPresent: () => boolean;
}

function resolveUpdatedAt(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : value;
}

function resolveProviderOption<T>(value: ProviderOptionValue<T> | undefined, fallback: T): T {
  if (value === undefined) return fallback;
  return typeof value === "function" ? (value as () => T)() : value;
}

function resolveRenderedState(rendered: ProviderRenderedState): { available: boolean; lines: string[] } {
  if (Array.isArray(rendered)) {
    return { available: rendered.length > 0, lines: rendered };
  }
  return {
    available: rendered.available === true,
    lines: [...rendered.lines],
  };
}

function normalizeRuntimeProviderId(providerId: string): string {
  const normalized = providerId.trim();
  if (normalized.length === 0) {
    throw new Error("providerId is required");
  }
  return normalized;
}

export function registerProvider(options: RegisterProviderOptions): RegisteredProvider {
  const providerId = normalizeRuntimeProviderId(options.id);
  const runtime = createProviderRuntime({
    providerId,
    widgetId: options.widgetId,
    sink: options.sink,
  });

  const disposePresenceCallback = options.onHostPresenceChange
    ? subscribeToHostPresence((active) => {
        options.onHostPresenceChange?.(active);
      })
    : undefined;

  const refresh = () => {
    const rendered = resolveRenderedState(options.getRenderedLines());
    return runtime.update({
      providerId,
      available: rendered.available,
      lines: rendered.lines,
      updatedAt: resolveUpdatedAt(options.getUpdatedAt()),
      tags: resolveProviderOption(options.tags, undefined),
      priority: resolveProviderOption(options.priority, undefined),
      ttlMs: resolveProviderOption(options.ttlMs, undefined),
    });
  };

  refresh();

  return {
    refresh,
    stop() {
      disposePresenceCallback?.();
      runtime.stop();
    },
    getMode: () => runtime.getMode(),
    isHostPresent: () => runtime.isHostPresent(),
  };
}

export function createProviderRuntime(options: ProviderRuntimeOptions): ProviderRuntime {
  const providerId = normalizeRuntimeProviderId(options.providerId);
  let hostPresent = isHostPresent();
  let latest: ProviderEntry | undefined;
  let stopped = false;

  const renderStandalone = () => {
    if (!options.widgetId || !options.sink) return;
    const visible = latest && latest.available && latest.lines.length > 0 ? latest.lines : undefined;
    options.sink.setWidget(options.widgetId, visible);
  };

  const clearStandalone = () => {
    if (!options.widgetId || !options.sink) return;
    options.sink.setWidget(options.widgetId, undefined);
  };

  const applyState = () => {
    if (stopped) return;

    if (hostPresent) {
      clearStandalone();
      if (latest) {
        publishProviderEntry(latest);
      } else {
        removeProviderEntry(providerId);
      }
      return;
    }

    removeProviderEntry(providerId);
    renderStandalone();
  };

  const disposePresence = subscribeToHostPresence((active) => {
    hostPresent = active;
    applyState();
  });

  applyState();

  return {
    update(entry) {
      if (stopped) {
        throw new Error(`Provider runtime for ${providerId} is stopped`);
      }

      const overrideId = entry.providerId?.trim();
      if (overrideId && overrideId !== providerId) {
        throw new Error(`Provider runtime mismatch: expected ${providerId}, received ${overrideId}`);
      }

      latest = normalizeProviderEntry({ ...entry, providerId });
      applyState();
      return latest;
    },
    stop() {
      if (stopped) return;
      stopped = true;
      disposePresence();
      removeProviderEntry(providerId);
      clearStandalone();
    },
    getMode() {
      return hostPresent ? "host-owned" : "standalone";
    },
    isHostPresent() {
      return hostPresent;
    },
  };
}
