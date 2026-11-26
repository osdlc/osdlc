/**
 * `@osdlc/ecosystem/repositories`: where a person's checkouts are.
 *
 * - {@link repositoriesFile} reads and writes the family file
 *   `repositories.yaml`, which lists the roots to scan.
 * - {@link resolveRoots} gives the roots: the file's, or the defaults that
 *   {@link defaultRoots} works out from the caller's own checkout.
 * - {@link CheckoutLocator} and {@link locateCheckout} find every checkout
 *   whose `origin` names a repository.
 *
 * The roots are machine-only. A repository's config cannot set them, so a
 * cloned repository cannot point a tool at directories on a person's disk.
 */

export {
  REPOSITORIES_ENV,
  REPOSITORIES_FILE,
  repositoriesFile,
  type Repositories,
  type RepositoriesFile,
  type RepositoriesFileOptions,
  type RepositoriesLoad,
  type WriteRootsOptions,
  WriteConflictError,
} from './repositories/file.ts'

export {
  defaultRoots,
  resolveRoots,
  type ResolvedRoots,
  type RootsOptions,
  type RootsSource,
} from './repositories/roots.ts'

export {
  CheckoutLocator,
  locateCheckout,
  parseRepoTarget,
  type LocateOptions,
  type LocatedCheckout,
} from './repositories/locate.ts'
