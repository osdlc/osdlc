/**
 * A fake IDE plugin endpoint for `jetbrains.test.ts`: serves the `/api/sdlc`
 * wire format on a free port, requires the bearer token in argv[2], and serves
 * the project roots in argv[3..]. Prints `PORT <n>` once listening. Every
 * request is echoed to stderr as one `REQ <json>` line so the test can inspect
 * it; the prefix keeps it apart from anything else the runtime writes there.
 *
 * Env: `FAKE_PID` is the pid `ping` reports;
 * `FAKE_MODE` picks how the terminal calls answer: `ok` (default), `refuse`
 * (the plugin's refusals: `ok:false`, `accepted:false`, no tabs, focus not ok),
 * `errors` (HTTP error bodies: 400 on open, 503 on send, 500 on list/focus) or
 * `garbage` (a 200 that is not JSON, and an empty 200).
 *
 * Plain JavaScript on node:http, so it runs under any Node with no build step.
 */
import { createServer } from 'node:http'

const token = process.argv[2]
const projects = process.argv.slice(3)
const pid = Number(process.env['FAKE_PID'] ?? process.pid)
const mode = process.env['FAKE_MODE'] ?? 'ok'

/** The response for one request: a status and a body (JSON unless `raw`). */
function answer(path, body) {
  const json = (v, status = 200) => ({ status, body: JSON.stringify(v) })
  const fail = (status, error) => json({ error }, status)
  const raw = (text) => ({ status: 200, body: text })
  switch (path) {
    case '/api/sdlc/ping':
      return json({ protocol: 2, product: 'WebStorm', pid, projects })
    case '/api/sdlc/project/open':
      return json({ ok: true, project: body.path })
    case '/api/sdlc/terminal/open':
      if (mode === 'refuse') return json({ ok: false, error: 'no open project contains cwd' })
      if (mode === 'errors') return fail(400, 'cwd is required')
      if (mode === 'garbage') return raw('<html>not json</html>')
      return json({ ok: true, id: 'tab-1' })
    case '/api/sdlc/terminal/send':
      if (mode === 'refuse') return json({ accepted: false })
      if (mode === 'errors') return fail(503, 'the IDE UI thread was busy; nothing was done')
      if (mode === 'garbage') return raw('')
      return json({ accepted: true })
    case '/api/sdlc/terminal/list':
      if (mode === 'refuse') return json({ terminals: [] })
      if (mode === 'errors') return fail(500, 'internal error: IllegalStateException')
      return json({ terminals: [{ id: 'tab-1', title: 'claude', cwd: body.cwd, alive: true }] })
    case '/api/sdlc/terminal/focus':
      if (mode === 'refuse') return json({ ok: false })
      if (mode === 'errors') return fail(500, 'internal error: IllegalStateException')
      return json({ ok: true })
    default:
      return json({ ok: false, error: 'unknown endpoint' }, 404)
  }
}

const server = createServer((req, res) => {
  const chunks = []
  req.on('data', (c) => chunks.push(c))
  req.on('end', () => {
    const path = new URL(req.url ?? '/', 'http://127.0.0.1').pathname
    let reply
    if (req.headers['authorization'] !== `Bearer ${token}`) {
      reply = { status: 401, body: JSON.stringify({ ok: false, error: 'unauthorized' }) }
    } else {
      let body = {}
      if (req.method === 'POST') {
        try {
          body = JSON.parse(Buffer.concat(chunks).toString('utf8'))
        } catch {
          body = {}
        }
      }
      process.stderr.write(`REQ ${JSON.stringify({ path, body })}\n`)
      reply = answer(path, body)
    }
    res.writeHead(reply.status, { 'content-type': 'application/json' })
    res.end(reply.body)
  })
})
server.listen(0, '127.0.0.1', () => {
  process.stdout.write(`PORT ${server.address().port}\n`)
})
