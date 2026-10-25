---
"@osdlc/command-seam": minor
---

Quoting that holds in fish, and an entry point a browser can load.

- `shellQuote`, `shellJoin` and `commandString` (POSIX) write each `\` outside the single quotes, as `'\\'`. fish reads `\'` and `\\` inside single quotes as escapes, so a word ending in `\` used to leave the quotes open, and a pasted line could run the next word as a command. The line means the same in sh, bash and zsh.
- New entry point `@osdlc/command-seam/quote` with `commandString`, `shellJoin`, `shellQuote` and `CommandStringOptions`. It imports nothing from Node.
