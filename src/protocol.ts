export const REGISTRY_SYMBOL = Symbol.for("pi-widget-host.registry.v1");
export const HOST_PRESENCE_SYMBOL = Symbol.for("pi-widget-host.presence.v1");

export interface ProviderEntry {
  providerId: string;
  available: boolean;
  lines: string[];
  updatedAt: string;
  priority?: number;
  tags?: string[];
  mode?: string;
  ttlMs?: number;
}

type RegistryListener = () => void;
type PresenceListener = (active: boolean) => void;

export interface WidgetHostRegistry {
  version: 1;
  set: (entry: ProviderEntry) => void;
  remove: (providerId: string) => void;
  list: () => ProviderEntry[];
  subscribe: (listener: RegistryListener) => () => void;
  clear: () => void;
}

interface HostPresenceStore {
  active: boolean;
  listeners: Set<PresenceListener>;
}

function trimNonEmpty(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function normalizeTags(tags: unknown): string[] | undefined {
  if (!Array.isArray(tags)) return undefined;
  const normalized = [...new Set(tags.map((tag) => trimNonEmpty(String(tag))).filter((tag): tag is string => Boolean(tag)))];
  return normalized.length > 0 ? normalized : undefined;
}

function normalizeLines(lines: unknown): string[] {
  if (!Array.isArray(lines)) return [];
  return lines.map((line) => String(line));
}

function normalizeIsoDate(value: unknown): string {
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid provider updatedAt value: ${String(value)}`);
  }
  return date.toISOString();
}

export function normalizeProviderEntry(entry: ProviderEntry): ProviderEntry {
  const providerId = trimNonEmpty(entry.providerId);
  if (!providerId) {
    throw new Error("providerId is required");
  }

  return {
    providerId,
    available: entry.available === true,
    lines: normalizeLines(entry.lines),
    updatedAt: normalizeIsoDate(entry.updatedAt),
    priority: Number.isFinite(entry.priority) ? entry.priority : 0,
    tags: normalizeTags(entry.tags),
    mode: trimNonEmpty(entry.mode),
    ttlMs: Number.isFinite(entry.ttlMs) && (entry.ttlMs ?? 0) > 0 ? entry.ttlMs : undefined,
  };
}

function sameEntry(left: ProviderEntry | undefined, right: ProviderEntry): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function createRegistry(): WidgetHostRegistry {
  const entries = new Map<string, ProviderEntry>();
  const listeners = new Set<RegistryListener>();

  const notify = () => {
    for (const listener of listeners) {
      listener();
    }
  };

  return {
    version: 1,
    set(entry) {
      const normalized = normalizeProviderEntry(entry);
      const previous = entries.get(normalized.providerId);
      if (sameEntry(previous, normalized)) return;
      entries.set(normalized.providerId, normalized);
      notify();
    },
    remove(providerId) {
      if (!entries.delete(String(providerId))) return;
      notify();
    },
    list() {
      return [...entries.values()].map((entry) => ({
        ...entry,
        lines: [...entry.lines],
        tags: entry.tags ? [...entry.tags] : undefined,
      }));
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    clear() {
      if (entries.size === 0) return;
      entries.clear();
      notify();
    },
  };
}

function createHostPresenceStore(): HostPresenceStore {
  return {
    active: false,
    listeners: new Set<PresenceListener>(),
  };
}

export function getWidgetHostRegistry(): WidgetHostRegistry {
  const root = globalThis as typeof globalThis & Record<symbol, WidgetHostRegistry | undefined>;
  const existing = root[REGISTRY_SYMBOL];
  if (existing) return existing;
  const registry = createRegistry();
  root[REGISTRY_SYMBOL] = registry;
  return registry;
}

function getHostPresenceStore(): HostPresenceStore {
  const root = globalThis as typeof globalThis & Record<symbol, HostPresenceStore | undefined>;
  const existing = root[HOST_PRESENCE_SYMBOL];
  if (existing) return existing;
  const store = createHostPresenceStore();
  root[HOST_PRESENCE_SYMBOL] = store;
  return store;
}

export function listProviderEntries(): ProviderEntry[] {
  return getWidgetHostRegistry().list();
}

export function publishProviderEntry(entry: ProviderEntry): void {
  getWidgetHostRegistry().set(entry);
}

export function removeProviderEntry(providerId: string): void {
  getWidgetHostRegistry().remove(providerId);
}

export function clearProviderEntries(): void {
  getWidgetHostRegistry().clear();
}

export function isHostPresent(): boolean {
  return getHostPresenceStore().active;
}

export function setHostPresenceActive(active: boolean): void {
  const store = getHostPresenceStore();
  if (store.active === active) return;
  store.active = active;
  for (const listener of store.listeners) {
    listener(active);
  }
}

export function subscribeToHostPresence(listener: PresenceListener): () => void {
  const store = getHostPresenceStore();
  store.listeners.add(listener);
  return () => {
    store.listeners.delete(listener);
  };
}
