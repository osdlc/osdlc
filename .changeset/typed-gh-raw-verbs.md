---
'@osdlc/typed-gh': minor
---

`raw(argv)` and `rawChecked(argv)` are new verbs: `Gh.raw` and `Gh.rawChecked` as functions, so a tool can make a call the verb table lacks without constructing a `Gh`. Through `runVerb`, `raw` returns the `CommandResult` whatever the exit code, and `rawChecked` returns it when `gh` exits 0 with its whole output and throws the classified `GhFailure` otherwise. Neither is `readOnly`. Both clients' `raw` and `rawChecked` methods now run these verbs. The one visible change is that `AsyncGh.raw` rejects, rather than throwing at the call site, when a runner throws synchronously, as `rawChecked` already did.

The README has a new section, "Keeping a bundle small": a bundled tool that makes a few calls should import the verbs it calls and run them with `runVerb`, because a bundler cannot drop a class's unused methods. For a diff and one raw checked call, that is 14.4 KB against 68.0 KB through `Gh` (`bun build --minify`). The decision and the measurements are in `docs/planning/decisions/bundle-size.md`.
