---
"@osdlc/wayfinder": patch
---

- The README and the checkout guide give the devlink state path for each platform: `${XDG_CONFIG_HOME:-~/.config}/way` on Linux and macOS, `%APPDATA%\way` on Windows.
- wayfinder's tests run on Windows in CI. Windows is tier 2: the job reports and does not block a release.
