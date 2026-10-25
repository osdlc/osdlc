---
'@osdlc/command-seam': minor
---

New `isJsonParseFailure(error)` tells a failed run from output that could not be used. Given the `error` of a failed `runJson`, `runJsonAsync` or `parseJsonResult`, it returns `true` for `unparseable` and `invalid` (the command ran, but its stdout was no use) and `false` for any command failure. TypeScript narrows `error` to match in both branches. Before, you had to list the two parse kinds by hand, or list every command-failure kind and miss one added later. The error values themselves are unchanged. The function is experimental, like `runJson`.
