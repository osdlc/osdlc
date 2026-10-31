// Runs `way` from the TypeScript source in a fresh process, for the
// end-to-end tests. Node strips the types. The installed `bin/way.js` runs
// `runWay`, which adds the devlink hand-off and `--where`; these tests do not
// exercise them.
const { main } = await import('../../src/cli.ts')

process.exitCode = await main(process.argv.slice(2))
