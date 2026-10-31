#!/usr/bin/env node
// The installed `way`. Before running its own code it asks devlink which
// checkout should answer: the one `WAY_HOME` names, or the one `way dev link`
// linked. A checkout other than this one runs there instead. The cwd is never
// searched, so a repository you stand in cannot choose the code that runs.
// `runWay` does this through cli-tool's `runMain`, which also answers
// `--version` and `--where`. Requires the built dist/ (`pnpm run build`).
import { runWay } from '../dist/cli.js'

await runWay()
