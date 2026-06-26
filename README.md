# pi-widget-core

[![CI](https://github.com/eiei114/pi-widget-core/actions/workflows/ci.yml/badge.svg)](https://github.com/eiei114/pi-widget-core/actions/workflows/ci.yml)
[![Publish](https://github.com/eiei114/pi-widget-core/actions/workflows/publish.yml/badge.svg)](https://github.com/eiei114/pi-widget-core/actions/workflows/publish.yml)
[![npm version](https://img.shields.io/npm/v/pi-widget-core.svg)](https://www.npmjs.com/package/pi-widget-core)
[![npm downloads](https://img.shields.io/npm/dm/pi-widget-core.svg)](https://www.npmjs.com/package/pi-widget-core)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Trusted Publishing](https://img.shields.io/badge/npm-Trusted%20Publishing-blue.svg)](.github/workflows/publish.yml)

> Shared TypeScript library for Pi widget host/provider protocol, presence switching, and provider runtime helpers.

## What this is

`pi-widget-core` is a plain npm library—not a Pi extension package. It is the protocol source of truth for widget integration shared by `pi-widget-host` and core-enabled widget providers.

Use it when you need:

- shared types and registry helpers for host/provider widget state
- a provider runtime that publishes to the host registry when a host is present and falls back to standalone widget rendering otherwise
- host-facing helpers for reading provider entries and managing host presence

## Features

- **Protocol surface** — shared `ProviderEntry` types, in-process host registry, and host presence signals
- **Provider runtime** — `createProviderRuntime()` handles host-owned publish vs standalone fallback with one API
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
npm install pi-widget-core@0.1.1
```

## Quick start

Import the subpath that matches your role:

```ts
// Protocol types and registry primitives
import { publishProviderEntry, type ProviderEntry } from "pi-widget-core/protocol";

// Provider-side runtime (host-aware publish + standalone fallback)
import { createProviderRuntime } from "pi-widget-core/provider";

// Host-side presence and registry helpers
import { markHostPresent, listProviderEntries } from "pi-widget-core/host";
```

**Widget provider** — create a runtime, push updates, and let the library switch between host-owned and standalone display:

```ts
import { createProviderRuntime } from "pi-widget-core/provider";

const runtime = createProviderRuntime({
  providerId: "my-widget",
  widgetId: "widget-my-widget",
  sink: {
    setWidget: (_id, lines) => {
      // render lines in your extension widget when no host is present
    },
  },
});

runtime.update({
  available: true,
  lines: ["Now playing: Example Track"],
  updatedAt: new Date().toISOString(),
  tags: ["music"],
});

// later
runtime.stop();
```

**Widget host** — mark presence and read published provider entries:

```ts
import { markHostPresent, listProviderEntries, subscribeToProviderEntries } from "pi-widget-core/host";

markHostPresent();

const unsubscribe = subscribeToProviderEntries(() => {
  const entries = listProviderEntries();
  // render aggregated provider state in the host UI
});

// when shutting down
unsubscribe();
```

### Export surface

| Subpath | Purpose |
|---|---|
| `pi-widget-core/protocol` | Shared protocol types, registry, and presence primitives |
| `pi-widget-core/provider` | `createProviderRuntime()` and provider-side helpers |
| `pi-widget-core/host` | Host presence and registry read/subscribe helpers |

## Package contents

| Path | Purpose |
|---|---|
| `src/protocol.ts` | Protocol types, host registry, and presence store |
| `src/provider.ts` | Provider runtime with host-aware publish and standalone fallback |
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
