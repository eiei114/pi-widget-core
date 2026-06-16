import {
  isHostPresent,
  normalizeProviderEntry,
  publishProviderEntry,
  removeProviderEntry,
  subscribeToHostPresence,
  type ProviderEntry,
} from "./protocol.ts";

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

function normalizeRuntimeProviderId(providerId: string): string {
  const normalized = providerId.trim();
  if (normalized.length === 0) {
    throw new Error("providerId is required");
  }
  return normalized;
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
