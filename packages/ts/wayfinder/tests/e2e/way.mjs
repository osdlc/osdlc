// Runs `way` from the TypeScript source in a fresh process, for the
// end-to-end tests. Node strips the types. The installed `bin/way.js` adds
// only the devlink hand-off, which these tests do not exercise.
const { main } = await import('../../src/cli.ts')

process.exitCode = await main(process.argv.slice(2))
