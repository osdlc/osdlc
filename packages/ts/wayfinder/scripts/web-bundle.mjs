// Bundles the web view's script for the browser. Used by the build and, in a
// checkout without dist/, by src/page.ts on each request.
import { rolldown } from 'rolldown'

/** The bundled script for `entry`, as one ES module. */
export async function bundleWeb(entry) {
  const bundle = await rolldown({ input: entry, platform: 'browser', logLevel: 'silent' })
  try {
    const { output } = await bundle.generate({ format: 'esm' })
    return output[0].code
  } finally {
    await bundle.close()
  }
}
