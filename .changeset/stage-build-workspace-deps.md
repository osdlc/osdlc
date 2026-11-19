---
"@osdlc/package-checks": patch
---

`stage` runs `pnpm install` when `node_modules` is missing at the root or in the package and builds the package and its workspace dependencies before the placeholder publish, so a fresh clone stages in one command. A failure names the step that failed.
