/**
 * The showcase fixture's catalog, written out rather than detected.
 *
 * The frame snapshots assert on every run, INCLUDING in CI, so what they read
 * has to be the same everywhere. Collecting from `./showcase/` is not: `just`'s
 * parameters come from `just --dump`, so on a machine without the binary the
 * provider falls back to parsing source, sees no parameters, and the entry-line
 * frame has nothing to render. That is exactly how this first reached CI — four
 * frame tests red on a runner with no `just` installed.
 *
 * Writing the catalog down fixes the level the frames are actually testing. They
 * are about the TERMINAL UI'S LAYOUT, not about detection; detection has its own
 * suite. A literal catalog makes them hermetic, instant, and identical on every
 * machine.
 *
 * It mirrors `./showcase/` deliberately, task for task, so the committed frames
 * and the committed screenshots depict the same project — the screenshots come
 * from the real detector against those real files, where a missing binary is a
 * capture-time inconvenience rather than a failing gate.
 */

import type { Catalog, RunnerReport, Task } from '@osdlc/system-model/detect'

function task(
  partial: Omit<Task, 'cwd' | 'origin' | 'tags' | 'persistent' | 'executes'> &
    Partial<Pick<Task, 'persistent'>>,
): Task {
  return {
    cwd: '.',
    origin: 'declared',
    tags: [],
    persistent: { value: false, declared: false },
    executes: 'local',
    ...partial,
  }
}

const JUST: RunnerReport = {
  runner: 'just',
  status: 'ok',
  chain: [
    { label: 'runner', hint: 'just runs recipes declared in a justfile.' },
    { label: 'justfile', hint: 'The justfile the recipe is declared in.' },
    { label: 'recipe', hint: 'The recipe name, as written before the colon.' },
  ],
  skippedForExec: false,
  diagnostics: [],
  tasks: [
    task({
      id: 'just:build',
      runner: 'just',
      path: ['just', '.', 'build'],
      argv: ['just', 'build'],
      display: 'just build',
      parameters: [],
      source: 'justfile',
      doc: 'Build the thing.',
      detail: 'echo building',
    }),
    task({
      id: 'just:deploy',
      runner: 'just',
      path: ['just', '.', 'deploy'],
      argv: ['just', 'deploy'],
      display: 'just deploy <env> [tag]',
      // The reason this file exists: without `just` on PATH these are empty,
      // and the entry-line frame has nothing to show.
      parameters: [
        { name: 'env', required: true, variadic: false },
        { name: 'tag', required: false, variadic: false },
      ],
      source: 'justfile',
      doc: 'Ship a build to an environment.',
      detail: 'echo deploying {{env}} {{tag}}',
    }),
    task({
      id: 'just:dev',
      runner: 'just',
      path: ['just', '.', 'dev'],
      argv: ['just', 'dev'],
      display: 'just dev',
      parameters: [],
      source: 'justfile',
      doc: 'Serve the app until you stop it.',
      detail: 'echo serving',
      persistent: { value: true, declared: false },
    }),
    task({
      id: 'just:test',
      runner: 'just',
      path: ['just', '.', 'test'],
      argv: ['just', 'test'],
      display: 'just test',
      parameters: [],
      source: 'justfile',
      doc: 'Run the test suite.',
      detail: 'echo testing',
    }),
  ],
}

const MAKE: RunnerReport = {
  runner: 'make',
  status: 'ok',
  chain: [
    { label: 'runner', hint: 'make runs targets declared in a Makefile.' },
    { label: 'makefile', hint: 'The Makefile the target is declared in.' },
    { label: 'target', hint: 'The target name, at column 0 before the colon.' },
  ],
  skippedForExec: false,
  diagnostics: [],
  tasks: [
    task({
      id: 'make:all',
      runner: 'make',
      path: ['make', '.', 'all'],
      argv: ['make', 'all'],
      display: 'make all',
      parameters: [],
      source: 'Makefile',
    }),
    task({
      id: 'make:clean',
      runner: 'make',
      path: ['make', '.', 'clean'],
      argv: ['make', 'clean'],
      display: 'make clean',
      parameters: [],
      source: 'Makefile',
    }),
  ],
}

const NODE_SCRIPTS: RunnerReport = {
  runner: 'node-scripts',
  status: 'ok',
  chain: [
    { label: 'runner', hint: 'Scripts declared in a package.json.' },
    { label: 'directory', hint: 'The directory the package sits in.' },
    { label: 'package', hint: "The package's name." },
    { label: 'script', hint: "The script's key under `scripts`." },
  ],
  skippedForExec: false,
  diagnostics: [],
  tasks: [
    task({
      id: 'node-scripts:build',
      runner: 'node-scripts',
      path: ['node-scripts', '.', 'showcase', 'build'],
      argv: ['npm', 'run', 'build'],
      display: 'npm run build',
      parameters: [],
      source: 'package.json',
      detail: 'echo building',
    }),
    task({
      id: 'node-scripts:lint',
      runner: 'node-scripts',
      path: ['node-scripts', '.', 'showcase', 'lint'],
      argv: ['npm', 'run', 'lint'],
      display: 'npm run lint',
      parameters: [],
      source: 'package.json',
      detail: 'echo linting',
    }),
    task({
      id: 'node-scripts:start',
      runner: 'node-scripts',
      path: ['node-scripts', '.', 'showcase', 'start'],
      argv: ['npm', 'run', 'start'],
      display: 'npm run start',
      parameters: [],
      source: 'package.json',
      detail: 'echo serving',
      persistent: { value: true, declared: false },
    }),
  ],
}

/** The catalog the frame snapshots render. Nine tasks, three runners. */
export function showcaseCatalog(): Catalog {
  return {
    root: '/showcase',
    // Pinned: the status line prints this, and a live clock would put the wall
    // time into every committed frame.
    generatedAt: new Date(0).toISOString(),
    discovery: 'walk',
    allowExec: false,
    reports: [JUST, MAKE, NODE_SCRIPTS],
  }
}
