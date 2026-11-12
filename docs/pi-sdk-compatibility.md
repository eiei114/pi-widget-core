# Pi SDK compatibility

The frozen 1.5.0 pins and migration guidance follow the verified [pi-extension-template baseline PR #141](https://github.com/eiei114/pi-extension-template/pull/141), merged at commit `e280e806c0e26f7ff4dd98627091c3cb4c9397b3`. That baseline's [`docs/pi-sdk-compatibility.md`](https://github.com/eiei114/pi-extension-template/blob/e280e806c0e26f7ff4dd98627091c3cb4c9397b3/docs/pi-sdk-compatibility.md) records verified 1.5.0 migration guidance and runtime-smoke contract.

Pi 1.5.0 moves tool-argument validation to `pi-schema`, where only JSON Schema features apply; TypeBox-only features such as `Type.Refine()` and codecs no longer validate tool arguments, and validation messages/coercion behavior differ. Pi 1.5.0 also removes TypeBox re-exports from `pi-ai`; extensions needing TypeBox should import it from `typebox`, and `StringEnum` inside `Type.Object` needs a type-safe wrapper such as `Type.Unsafe<T>(...)`. `pi-coding-agent` pins `typebox` to `1.3.27`, which is preserved by the lockfile. These changes do not require a source migration here: `pi-widget-core`'s published source imports no Pi SDK API and defines no Pi tool schemas. The 1.2.0 `before_agent_start` message-union change is likewise not used in this package.

All four SDK packages use exact 1.5.0 development pins in `package.json`; public peer ranges remain unchanged. The smoke harness derives expected versions from those pins, launches the installed Pi CLI in an isolated agent directory, and loads a test extension that imports this checkout's provider, host, and protocol modules. It checks registration, normalized feature output, handled invalid-ID behavior, a second actual host process and disposal, and the native host shell boundary. The offline scenario makes no model/provider inference, but the Pi host, extension lifecycle, RPC responses, and feature paths are real rather than mocked. Run `npm run smoke:pi`; `npm run ci` executes this check and writes `docs/verification/pi-sdk-smoke.json`.

### Host shell boundary

The `host_shell` case runs the native shell of the host that executes the harness, and the branch is chosen from `process.platform` in `scripts/pi-sdk-smoke.mjs`:

| Platform | Shell used by `host_shell` |
| --- | --- |
| Windows (`win32`) | `powershell.exe` (`-NoProfile -NonInteractive`) |
| Everything else (Linux, macOS) | `/bin/sh -c` |

The Windows PowerShell case runs only on a Windows host; a Linux or macOS run exercises `/bin/sh` instead and never proves Windows-shell coverage. The repository CI workflow (`.github/workflows/ci.yml`) runs `npm run ci` on `ubuntu-latest` only, so CI covers the non-Windows `/bin/sh` branch. Windows PowerShell coverage requires running `npm run ci` (or `npm run smoke:pi`) on Windows and checking that the generated report records `platform: "win32"` and a passing `host_shell` case. This checkout's committed report is a `win32` run for exactly that reason; the Ubuntu CI job demonstrates the `/bin/sh` branch.
