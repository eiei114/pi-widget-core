# pi-widget-core

Maintainer-facing core library for Pi widget host/provider protocol, presence switching, and shared runtime helpers.

## What this is

- plain TypeScript npm library
- protocol source of truth for shared widget integration
- provider runtime helper for host-aware self-suppress and standalone fallback
- host-facing helper surface for reading shared provider state

## Export surface

- `pi-widget-core/protocol`
- `pi-widget-core/provider`
- `pi-widget-core/host`

## Development

```bash
npm install
npm run ci
```
