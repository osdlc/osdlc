/**
 * Serves a built Storybook (`storybook-static`) over HTTP on the loopback
 * interface.
 *
 * Plain Node, no dependencies: the Linux container that runs the baseline
 * check copies this folder and has Node and Playwright, nothing else. The
 * baseline check runs it as a script:
 *
 *   node serve-static.js <storybook-static dir> <port>
 */
import { createServer } from 'node:http'
import { realpathSync } from 'node:fs'
import { readFile, stat } from 'node:fs/promises'
import { extname, join, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const MIME: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.ico': 'image/x-icon',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.wasm': 'application/wasm',
  '.map': 'application/json',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.txt': 'text/plain',
}

/**
 * Serve `dir` on `127.0.0.1:<port>`. A path that resolves outside `dir` gets a
 * 404, and a path with no file falls back to `index.html`. Rejects when the
 * port cannot be bound (for example `EADDRINUSE`). Resolves to a function that
 * stops the server.
 *
 * @param dir - The static build to serve, such as `storybook-static`.
 * @param port - The port to listen on. `0` picks a free one.
 */
export async function serveStatic(dir: string, port: number): Promise<() => void> {
  const root = resolve(dir)
  // `resolve('/')` already ends in the separator.
  const inside = root.endsWith(sep) ? root : root + sep
  const server = createServer(async (req, res) => {
    try {
      const urlPath = decodeURIComponent((req.url ?? '/').split('?')[0]!)
      let filePath = resolve(root, '.' + (urlPath === '/' ? '/index.html' : urlPath))
      // A decoded `..` must not leave the build.
      if (!filePath.startsWith(inside)) throw new Error('outside the build')
      const st = await stat(filePath).catch(() => null)
      if (!st || st.isDirectory()) filePath = join(root, 'index.html')
      const body = await readFile(filePath)
      res.writeHead(200, {
        'Content-Type': MIME[extname(filePath).toLowerCase()] ?? 'application/octet-stream',
      })
      res.end(body)
    } catch {
      res.writeHead(404)
      res.end('not found')
    }
  })
  // Loopback only: the build is for the local browser, not the network.
  await new Promise<void>((done, fail) => {
    server.once('error', fail)
    server.listen(port, '127.0.0.1', () => {
      server.off('error', fail)
      done()
    })
  })
  return () => {
    server.close()
  }
}

/** Whether this file is the script Node was started with, through a symlink or not. */
function isMain(): boolean {
  const script = process.argv[1]
  if (!script) return false
  try {
    return realpathSync(script) === realpathSync(fileURLToPath(import.meta.url))
  } catch {
    return false
  }
}

if (isMain()) {
  const [dir, port] = process.argv.slice(2)
  if (!dir || !port) {
    console.error('usage: node serve-static.js <storybook-static dir> <port>')
    process.exit(2)
  }
  await serveStatic(dir, Number(port))
  console.log(`serving ${dir} on ${port}`)
}
