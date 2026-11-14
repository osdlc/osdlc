// Runs the package under plain Node, imported by its name the way a consumer
// imports it, and checks that every built-in host is in the registry. It must
// not import other repository files: the package check copies it into a clean
// project that installed the tarball.
import { strict as assert } from 'node:assert'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { HOST_NAMES, hostRegistry, requirePart } from '@osdlc/agent-seat'

const hosts = hostRegistry({ runtimeDir: mkdtempSync(join(tmpdir(), 'agent-seat-smoke-')) })
for (const name of HOST_NAMES) assert.equal(hosts[name]?.name, name)
assert.throws(() => requirePart(hosts.terminal, 'send'), /host 'terminal' cannot/)
