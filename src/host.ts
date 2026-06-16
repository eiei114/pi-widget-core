import {
  clearProviderEntries,
  getWidgetHostRegistry,
  isHostPresent,
  listProviderEntries,
  publishProviderEntry,
  removeProviderEntry,
  setHostPresenceActive,
  subscribeToHostPresence,
  type ProviderEntry,
  type WidgetHostRegistry,
} from "./protocol.ts";

export type { ProviderEntry, WidgetHostRegistry } from "./protocol.ts";

export function markHostPresent(): void {
  setHostPresenceActive(true);
}

export function clearHostPresent(): void {
  setHostPresenceActive(false);
}

export function subscribeToProviderEntries(listener: () => void): () => void {
  return getWidgetHostRegistry().subscribe(listener);
}

export {
  clearProviderEntries,
  getWidgetHostRegistry,
  isHostPresent,
  listProviderEntries,
  publishProviderEntry,
  removeProviderEntry,
  subscribeToHostPresence,
};
