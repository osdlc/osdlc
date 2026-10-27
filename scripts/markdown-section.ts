// The markdown reader both package-shape checkers share, so a TypeScript and a
// Rust README are judged by one rule. It imports nothing: rust-ci runs
// package-shape-rs.ts with nothing installed.

/** The body of the `## <heading>` section of a markdown file, or null. */
export function section(markdown: string, heading: string): string | null {
  const lines = markdown.split('\n')
  let inFence = false
  let start = -1
  for (let i = 0; i < lines.length; i++) {
    if (/^(```|~~~)/.test(lines[i]!)) inFence = !inFence
    if (inFence) continue
    if (start === -1) {
      if (lines[i] === `## ${heading}`) start = i + 1
    } else if (/^## /.test(lines[i]!)) {
      return lines.slice(start, i).join('\n')
    }
  }
  return start === -1 ? null : lines.slice(start).join('\n')
}
