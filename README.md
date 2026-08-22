# pi-widget-core

[![CI](https://github.com/eiei114/pi-widget-core/actions/workflows/ci.yml/badge.svg)](https://github.com/eiei114/pi-widget-core/actions/workflows/ci.yml)
[![Publish](https://github.com/eiei114/pi-widget-core/actions/workflows/publish.yml/badge.svg)](https://github.com/eiei114/pi-widget-core/actions/workflows/publish.yml)
[![npm version](https://img.shields.io/npm/v/pi-widget-core.svg)](https://www.npmjs.com/package/pi-widget-core)
[![npm downloads](https://img.shields.io/npm/dm/pi-widget-core.svg)](https://www.npmjs.com/package/pi-widget-core)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Trusted Publishing](https://img.shields.io/badge/npm-Trusted%20Publishing-blue.svg)](.github/workflows/publish.yml)
<a href="https://buymeacoffee.com/ekawano114m"><img src="https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png" alt="Buy Me A Coffee" width="217" height="60"></a>

> Shared TypeScript library for Pi widget host/provider protocol, presence switching, and provider runtime helpers.

## What this is

`pi-widget-core` is a plain npm library—not a Pi extension package. It is the protocol source of truth for widget integration shared by `pi-widget-host` and core-enabled widget providers.

Use it when you need:

- shared types and registry helpers for host/provider widget state
- a provider runtime that publishes to the host registry when a host is present and falls back to standalone widget rendering otherwise
- host-facing helpers for reading provider entries and managing host presence

## Features

- **Protocol surface** — shared `ProviderEntry` types, in-process host registry, and host presence signals
- **Provider runtime** — `registerProvider()` and `createProviderRuntime()` handle host-owned publish vs standalone fallback
- **Host helpers** — mark/clear host presence, list provider entries, and subscribe to registry changes
- **Subpath exports** — import only the surface your package needs: `protocol`, `provider`, or `host`
- **TypeScript-first** — ships typed `.ts` sources for direct consumption by extension packages

## Install

Add the library to your Pi extension or widget provider package:

```bash
npm install pi-widget-core
```

Pin a specific version when you want reproducible installs:

```bash
npm install pi-widget-core@0.1.4
```

## Quick start

Import the subpath that matches your role:

```ts
// Protocol types and registry primitives
import { publishProviderEntry, type ProviderEntry } from "pi-widget-core/protocol";

// Provider-side runtime (host-aware publish + standalone fallback)
import { registerProvider } from "pi-widget-core/provider";

// Host-side presence and registry helpers
import { markHostPresent, listProviderEntries } from "pi-widget-core/host";
```

**Widget provider** — register callbacks for rendered lines and host presence, then call `refresh()` when your widget state changes:

```ts
import { registerProvider } from "pi-widget-core/provider";

const provider = registerProvider({
  id: "my-widget",
  widgetId: "widget-my-widget",
  tags: ["music"],
  priority: 10,
  ttlMs: 30_000,
  getUpdatedAt: () => new Date().toISOString(),
  getRenderedLines: () => ({
    available: true,
    lines: ["Now playing: Example Track"],
  }),
  onHostPresenceChange: (hostPresent) => {
    // optional: react when Host appears or disappears
  },
  sink: {
    setWidget: (_id, lines) => {
      // render lines in your extension widget when no host is present
    },
  },
});

// when your snapshot/cache changes
provider.refresh();

// when shutting down
provider.stop();
```

For lower-level control, `createProviderRuntime()` accepts explicit `update()` payloads instead of callback getters.

**Widget host** — mark presence and read published provider entries:

```ts
import { markHostPresent, clearHostPresent, listProviderEntries, subscribeToProviderEntries } from "pi-widget-core/host";

markHostPresent();

const unsubscribe = subscribeToProviderEntries(() => {
  const entries = listProviderEntries();
  // render aggregated provider state in the host UI
});

// when shutting down
unsubscribe();
clearHostPresent();
```

### Export surface

| Subpath | Purpose |
|---|---|
| `pi-widget-core/protocol` | Protocol v1 types (`ProviderEntry`, `WidgetHostRegistry`), registry, and presence primitives |
| `pi-widget-core/provider` | `registerProvider()`, `createProviderRuntime()`, and provider-side helpers |
| `pi-widget-core/host` | Host presence and registry read/subscribe helpers |

## Package contents

| Path | Purpose |
|---|---|
| `src/protocol.ts` | Protocol types, host registry, and presence store |
| `src/provider.ts` | `registerProvider()`, `createProviderRuntime()`, and provider-side helpers |
| `src/host.ts` | Host-facing registry and presence helpers |
| `README.md` | Public entrypoint documentation |
| `CHANGELOG.md` | Version history |
| `LICENSE` | MIT license |
| `SECURITY.md` | Vulnerability reporting policy |

## Development

```bash
npm install
npm run ci
```

`npm run ci` runs typecheck, tests, and `npm pack --dry-run`.

## Release

This package publishes to npm via GitHub Actions Trusted Publishing—no `NPM_TOKEN` is required.

1. Bump `package.json` version and add a `CHANGELOG.md` entry.
2. Merge to `main`; the publish workflow validates the package and publishes new versions.

Tagged releases (`v*.*.*`) and `package.json` changes on `main` can both trigger publish.

## Security

Review dependencies and extension code before installing third-party Pi packages. Widget providers can execute with your local permissions.

For vulnerability reporting, see [`SECURITY.md`](SECURITY.md).

## Links

- npm: https://www.npmjs.com/package/pi-widget-core
- GitHub: https://github.com/eiei114/pi-widget-core
- Issues: https://github.com/eiei114/pi-widget-core/issues

## License

MIT
