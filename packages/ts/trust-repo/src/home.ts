/**
 * The home directory every default path in this package is built on.
 */

import { homeDir as tieredHomeDir } from '@osdlc/tiered-dirs'

/**
 * The user's home directory, always absolute: `@osdlc/tiered-dirs`'s
 * `homeDir`. `HOME` (`USERPROFILE` on Windows) is used when it is absolute. A
 * relative value would put every path built on it inside the folder the tool
 * runs in, which can be the repository being judged, so it is treated as
 * unset and the OS account's home is used instead. Throws a `TieredDirsError`
 * (code `MISSING_BASE_DIR`) when no absolute home can be found.
 * @experimental
 */
export function homeDir(): string {
  return tieredHomeDir()
}
