/**
 * @osdlc/markdown-vault — markdown vault data model and disk scanner.
 *
 * A vault is a folder of markdown files linked by Obsidian conventions:
 * `[[wikilinks]]`, `![[embeds]]`, tags, YAML frontmatter. `scanVault` walks
 * one and returns each note's frontmatter, tags, outgoing links, and
 * computed backlinks. The Obsidian app is never involved.
 *
 * The model types are plain interfaces on purpose: any provider that
 * produces the same shape (an in-memory fixture, `createVaultIndex` over data
 * you hold) can stand in for the scanner. `@osdlc/markdown-vault-query` runs
 * Bases-style queries over the model.
 *
 * ```ts
 * import { scanVault } from '@osdlc/markdown-vault'
 *
 * const vault = await scanVault('/path/to/vault')
 * for (const note of vault.notes) console.log(note.file.path, note.links)
 * ```
 */

export {
  scanVault,
  createLinkResolver,
  parseFrontmatter,
  extractInlineTags,
  extractLinks,
  type FileMeta,
  type LinkRef,
  type VaultNote,
  type VaultIndex,
  type ScanOptions,
} from './scan.ts'

// Vault construction from externally-supplied note data (no filesystem scan)
export { createVaultIndex, type ExternalNote, type CreateVaultIndexOptions } from './from-data.ts'
