/**
 * What `--version` prints, shared by `defineApp` and `runMain` so a tool
 * answers the same whichever one handles it.
 */

/** `<name> <version>`, or with `json` the version document. */
export function renderVersion(name: string, version: string, json: boolean): string {
  return json
    ? `${JSON.stringify({ schemaVersion: 1, kind: 'version', name, version }, null, 2)}\n`
    : `${name} ${version}\n`
}
