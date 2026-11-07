/** Run the check scripts in checks.d against the staged files, as a pre-commit hook would. */
import {
  checksExitCode,
  formatReport,
  readCheckFolder,
  runChecks,
  stagedFiles,
} from '@osdlc/rule-review'

const root = process.cwd()
const folder = await readCheckFolder(`${root}/checks.d`)
const run = await runChecks(folder, {
  projectRoot: root,
  changeset: { files: stagedFiles(root), base: 'HEAD' },
})

process.stdout.write(formatReport(run))
process.exitCode = checksExitCode(run.results)
