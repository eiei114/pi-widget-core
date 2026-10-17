import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { clearHostPresent, listProviderEntries, markHostPresent } from "../../src/host.ts";
import { createProviderRuntime, registerProvider, type RegisteredProvider } from "../../src/provider.ts";
import { clearProviderEntries } from "../../src/protocol.ts";

const providerId = "pi-widget-core-sdk-smoke";
const renderedLine = "widget core provider is live";

export default function (pi: ExtensionAPI): void {
  let provider: RegisteredProvider | undefined;

  pi.on("session_start", async (_event, ctx) => {
    clearHostPresent();
    clearProviderEntries();
    provider = registerProvider({
      id: providerId,
      getUpdatedAt: () => "2026-10-16T00:00:00.000Z",
      getRenderedLines: () => ({ available: true, lines: [renderedLine] }),
    });
    markHostPresent();
    if (ctx.hasUI) ctx.ui.setStatus("widget-core", "Pi widget core loaded");
  });

  pi.on("input", async (event, ctx) => {
    if (event.source === "extension") return { action: "continue" };

    if (event.text.trim() === "?widget-core") {
      const entry = listProviderEntries().find((candidate) => candidate.providerId === providerId);
      if (ctx.hasUI) {
        ctx.ui.notify(`pi-widget-core:${JSON.stringify(entry ?? null)}`, "info");
      }
      return { action: "handled" };
    }

    if (event.text.trim() === "?widget-core-invalid") {
      try {
        createProviderRuntime({ providerId: "   " });
      } catch (error) {
        if (!(error instanceof Error) || error.message !== "providerId is required") throw error;
        if (ctx.hasUI) ctx.ui.notify(`pi-widget-core-error:${error.message}`, "info");
        return { action: "handled" };
      }
      throw new Error("Expected pi-widget-core to reject an empty provider ID");
    }

    return { action: "continue" };
  });

  pi.on("session_shutdown", async () => {
    provider?.stop();
    if (listProviderEntries().some((entry) => entry.providerId === providerId)) {
      throw new Error("pi-widget-core smoke provider was not disposed by stop");
    }
    provider = undefined;
    clearHostPresent();
    clearProviderEntries();
    console.log("[pi-widget-core-smoke] clean_shutdown");
  });
}
