/**
 * Child process for `file.test.ts`: `node write-roots.child.ts <root> <etag|-> <at-ms>` waits
 * until `<at-ms>`, so two children write at once, then writes `roots: [<root>]` with the etag
 * given (`-` for none) to the file `OSDLC_REPOSITORIES` names. Prints `ok` or `conflict`.
 */
import { repositoriesFile, WriteConflictError } from '../src/repositories.ts'

const [root, etag, at] = process.argv.slice(2) as [string, string, string]
const wait = Number(at) - Date.now()
if (wait > 0) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, wait)
try {
  repositoriesFile().writeRoots([root], { etag: etag === '-' ? null : etag })
  process.stdout.write('ok')
} catch (e) {
  if (!(e instanceof WriteConflictError)) throw e
  process.stdout.write('conflict')
}
