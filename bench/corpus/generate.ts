// A synthetic Obsidian-style vault, built from a seed. It carries no real
// content: every word comes from a fixed list and every name is made up. The
// shape follows a real vault's: note sizes are log-normal (most a couple of
// kilobytes, a few tens of kilobytes), and each note mixes prose with the
// constructs the markdown libraries scan for.
//
// Per kilobyte of body the generator yields about 4 wikilinks, 0.25 embeds,
// 0.65 markdown links, 1.9 inline tags and 0.4 code spans, with a fenced
// block and a callout about every 2.5 kilobytes. Links and tags also
// appear inside code, where they must not be found, and in the places a
// scanner could misread: aliases, headings, block ids, sizes, escaped pipes
// in tables, link destinations that hold a `#`, HTML comments.
//
// The output is deterministic: the same options give the same bytes.

import { type Random, chance, int, logNormal, pick, prng } from "./prng.ts";

/** One generated note. */
export interface Note {
  /** Path inside the vault, with forward slashes. */
  path: string;
  /** The whole file: frontmatter and body. */
  text: string;
  /** The text after the frontmatter. */
  body: string;
}

/** What `generateVault` builds. */
export interface VaultOptions {
  /** Seed for the random source. Default 20260101. */
  seed?: number;
  /** How many notes. Default 1200. */
  notes?: number;
  /** Median body size in bytes. Default 2200. */
  medianBytes?: number;
  /** Largest body, in bytes. Default 80000. */
  maxBytes?: number;
}

const WORDS = (
  "lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore " +
  "et dolore magna aliqua enim ad minim veniam quis nostrud exercitation ullamco laboris nisi aliquip " +
  "ex ea commodo consequat duis aute irure in reprehenderit voluptate velit esse cillum fugiat nulla " +
  "pariatur excepteur sint occaecat cupidatat non proident sunt culpa qui officia deserunt mollit anim " +
  "id est laborum garden kitchen plan budget trip recipe draft review notes meeting idea reading list " +
  "project weekly summary question answer later maybe today tomorrow schedule"
).split(" ");

const FOLDERS = [
  "daily",
  "projects",
  "people",
  "reference",
  "journal",
  "inbox",
  "recipes",
  "travel",
];
const TAG_ROOTS = [
  "project",
  "idea",
  "todo",
  "reading",
  "area",
  "status",
  "year",
  "review",
];
const TAG_LEAVES = [
  "active",
  "later",
  "done",
  "draft",
  "home",
  "work",
  "garden",
  "books",
  "q1",
  "q2",
];
const UNICODE_TAGS = ["café", "naïve", "日本語", "über", "résumé", "señal"];
const ASCII_ONLY_EDGE = ["2024", "1", "v2", "a-b", "a_b", "x/y/z"];
const LANGS = ["ts", "rust", "sh", "json", "yaml", "python", ""];
const CALLOUTS = ["note", "tip", "warning", "info", "quote", "example", "todo"];
const IMAGES = ["png", "jpg", "webp", "pdf", "mp3"];

function words(rand: Random, n: number): string {
  const out: string[] = [];
  for (let i = 0; i < n; i++) out.push(pick(rand, WORDS));
  return out.join(" ");
}

function title(rand: Random): string {
  const t = words(rand, int(rand, 1, 4));
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/** A note name the vault might hold, used as a link target. */
function targetName(rand: Random, count: number): string {
  return `Note ${int(rand, 0, count - 1)} ${pick(rand, WORDS)}`;
}

function tag(rand: Random): string {
  const r = rand();
  if (r < 0.45) return `${pick(rand, TAG_ROOTS)}/${pick(rand, TAG_LEAVES)}`;
  if (r < 0.75) return pick(rand, TAG_LEAVES);
  if (r < 0.88) return pick(rand, UNICODE_TAGS);
  return pick(rand, ASCII_ONLY_EDGE);
}

function wikilink(rand: Random, count: number): string {
  const name = targetName(rand, count);
  const r = rand();
  if (r < 0.6) return `[[${name}]]`;
  if (r < 0.75) return `[[${name}|${words(rand, int(rand, 1, 3))}]]`;
  if (r < 0.85) return `[[${name}#${title(rand)}]]`;
  if (r < 0.91) return `[[${name}#^${words(rand, 1)}${int(rand, 1, 99)}]]`;
  if (r < 0.95) return `[[#${title(rand)}]]`;
  return `[[${pick(rand, FOLDERS)}/${name}.md|${words(rand, 2)}]]`;
}

function embed(rand: Random, count: number): string {
  const r = rand();
  if (r < 0.5) return `![[img-${int(rand, 0, 400)}.${pick(rand, IMAGES)}]]`;
  if (r < 0.7)
    return `![[img-${int(rand, 0, 400)}.png|${int(rand, 100, 800)}]]`;
  if (r < 0.8)
    return `![[img-${int(rand, 0, 400)}.png|${int(rand, 100, 800)}x${int(rand, 100, 600)}]]`;
  return `![[${targetName(rand, count)}${chance(rand, 0.4) ? `#${title(rand)}` : ""}]]`;
}

function markdownLink(rand: Random, count: number): string {
  const r = rand();
  const label = words(rand, int(rand, 1, 3));
  if (r < 0.4)
    return `[${label}](${pick(rand, FOLDERS)}/note-${int(rand, 0, count - 1)}.md)`;
  if (r < 0.55)
    return `[${label}](../${pick(rand, FOLDERS)}/note%20${int(rand, 0, count - 1)}.md#${pick(rand, WORDS)})`;
  if (r < 0.65)
    return `[${label}](note-${int(rand, 0, count - 1)}.md "${words(rand, 2)}")`;
  if (r < 0.9)
    return `[${label}](https://example.com/${pick(rand, WORDS)}/${int(rand, 1, 999)}#section)`;
  return `[${label}](<note ${int(rand, 0, count - 1)}.md>)`;
}

function codeSpan(rand: Random, count: number): string {
  const r = rand();
  if (r < 0.4) return `\`${words(rand, 2)}\``;
  if (r < 0.6) return `\`[[${targetName(rand, count)}]]\``;
  if (r < 0.75) return `\`#${tag(rand)}\``;
  if (r < 0.9) return `\`${pick(rand, WORDS)}(${pick(rand, WORDS)})\``;
  return "`` a ` b ``";
}

/** One inline element, or a plain run of words. */
function inline(rand: Random, count: number): string {
  const r = rand();
  if (r < 0.17) return wikilink(rand, count);
  if (r < 0.185) return embed(rand, count);
  if (r < 0.225) return markdownLink(rand, count);
  if (r < 0.31) return `#${tag(rand)}`;
  if (r < 0.36) return codeSpan(rand, count);
  if (r < 0.38) return `**${words(rand, 2)}**`;
  if (r < 0.39) return `*${words(rand, 1)}*`;
  if (r < 0.395) return `<!-- [[${targetName(rand, count)}]] #${tag(rand)} -->`;
  if (r < 0.4) return `https://example.com/page#${pick(rand, WORDS)}`;
  if (r < 0.405) return `\\[\\[${pick(rand, WORDS)}\\]\\]`;
  return words(rand, int(rand, 2, 6));
}

function paragraph(rand: Random, count: number): string {
  const n = int(rand, 3, 14);
  const parts: string[] = [];
  for (let i = 0; i < n; i++) {
    parts.push(
      chance(rand, 0.45) ? words(rand, int(rand, 3, 8)) : inline(rand, count),
    );
  }
  return `${parts.join(" ")}.`;
}

function list(rand: Random, count: number): string {
  const n = int(rand, 2, 8);
  const lines: string[] = [];
  for (let i = 0; i < n; i++) {
    const marker = chance(rand, 0.3) ? "- [ ]" : "-";
    lines.push(
      `${marker} ${words(rand, int(rand, 1, 4))} ${inline(rand, count)}`,
    );
  }
  return lines.join("\n");
}

function table(rand: Random, count: number): string {
  const rows = int(rand, 2, 5);
  const out = ["| item | link | note |", "| --- | --- | --- |"];
  for (let i = 0; i < rows; i++) {
    out.push(
      `| ${words(rand, 1)} | [[${targetName(rand, count)}\\|${words(rand, 1)}]] | ${words(rand, 2)} |`,
    );
  }
  return out.join("\n");
}

function fence(rand: Random, count: number): string {
  const lang = pick(rand, LANGS);
  const tilde = chance(rand, 0.15);
  const mark = tilde ? "~~~" : chance(rand, 0.1) ? "````" : "```";
  const n = int(rand, 3, 14);
  const lines: string[] = [];
  for (let i = 0; i < n; i++) {
    lines.push(
      chance(rand, 0.15)
        ? `// see [[${targetName(rand, count)}]] #${tag(rand)}`
        : `const ${pick(rand, WORDS)}${i} = ${int(rand, 0, 9999)} // ${words(rand, 2)}`,
    );
  }
  return `${mark}${lang}\n${lines.join("\n")}\n${mark}`;
}

function callout(rand: Random, count: number): string {
  const kind = pick(rand, CALLOUTS);
  const fold = chance(rand, 0.2) ? "-" : "";
  const lines = [`> [!${kind}]${fold} ${title(rand)}`];
  const n = int(rand, 1, 4);
  for (let i = 0; i < n; i++)
    lines.push(`> ${words(rand, int(rand, 3, 8))} ${inline(rand, count)}`);
  return lines.join("\n");
}

function quote(rand: Random, count: number): string {
  return `> ${words(rand, int(rand, 4, 10))} ${inline(rand, count)}`;
}

/** Heading lines look like tags to a careless scanner: `# Title` has a space. */
function heading(rand: Random, level: number): string {
  return `${"#".repeat(level)} ${title(rand)}`;
}

function block(rand: Random, count: number): string {
  const r = rand();
  if (r < 0.52) return paragraph(rand, count);
  if (r < 0.64) return list(rand, count);
  if (r < 0.74) return heading(rand, int(rand, 2, 4));
  if (r < 0.82) return callout(rand, count);
  if (r < 0.9) return fence(rand, count);
  if (r < 0.95) return quote(rand, count);
  if (r < 0.98) return table(rand, count);
  return `${paragraph(rand, count)} ^${pick(rand, WORDS)}${int(rand, 1, 99)}`;
}

function frontmatter(rand: Random, name: string): string {
  const lines = ["---", `title: ${name}`];
  if (chance(rand, 0.8)) {
    lines.push("tags:");
    const n = int(rand, 1, 4);
    for (let i = 0; i < n; i++) lines.push(`  - ${tag(rand)}`);
  }
  if (chance(rand, 0.5))
    lines.push(`aliases: [${words(rand, 1)}, ${words(rand, 2)}]`);
  if (chance(rand, 0.6))
    lines.push(
      `created: 2024-${String(int(rand, 1, 12)).padStart(2, "0")}-${String(int(rand, 1, 28)).padStart(2, "0")}`,
    );
  if (chance(rand, 0.3)) lines.push(`related: "[[${targetName(rand, 1000)}]]"`);
  if (chance(rand, 0.2))
    lines.push(`cover: "![[img-${int(rand, 0, 400)}.png]]"`);
  lines.push("---");
  return lines.join("\n");
}

/** Generate the vault. The notes are named `<folder>/Note <i> <word>.md` so wikilinks mostly resolve. */
export function generateVault(options: VaultOptions = {}): Note[] {
  const {
    seed = 20260101,
    notes = 1200,
    medianBytes = 2200,
    maxBytes = 80_000,
  } = options;
  const rand = prng(seed);
  const out: Note[] = [];
  for (let i = 0; i < notes; i++) {
    const name = `Note ${i} ${pick(rand, WORDS)}`;
    const target = Math.min(
      maxBytes,
      Math.max(120, Math.round(logNormal(rand, medianBytes, 1.0))),
    );
    const blocks: string[] = [`# ${name}`];
    let size = blocks[0]!.length;
    while (size < target) {
      const b = block(rand, notes);
      blocks.push(b);
      size += b.length + 2;
    }
    const body = `${blocks.join("\n\n")}\n`;
    const text = `${frontmatter(rand, name)}\n${body}`;
    out.push({ path: `${pick(rand, FOLDERS)}/${name}.md`, text, body });
  }
  return out;
}
