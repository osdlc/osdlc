"""Writes the architecture page's diagrams to docs/diagrams/architecture-*.svg.

Run from the repo root: python3 tools/diagrams/architecture.py
It uses build.py's shared style and helpers, so both pages look the same.
"""
from build import ARROW, DARK, LIGHT, OUT, TARGET_KEY, W, X0, esc, grid, key, svg


def extra(c, ext):
    """Styles only these diagrams use; the shared ones come from build.py."""
    return f"""
.r-ext rect{{stroke:{ext}}} .r-ext .dot{{fill:{ext}}}
.lnum{{font-size:12px;font-weight:700;fill:{c['mut']}}}
.lvl.opt rect{{stroke-dasharray:5 4}}
.code rect{{fill:{c['chip']};stroke:{c['line']}}} .code text{{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px;fill:{c['fg']}}}"""


STYLE = f"<style>{extra(LIGHT, '#8a8a84')}\n@media (prefers-color-scheme: dark) {{{extra(DARK, '#a0a09a')}\n}}</style>"


def box(x, y, w, h, title, sub, cls="lvl"):
    return (f'<g class="{cls}"><rect x="{x}" y="{y}" width="{w}" height="{h}" rx="8"/></g>'
            f'<text class="cn" x="{x + 12}" y="{y + 21}">{esc(title)}</text>'
            f'<text class="cs" x="{x + 12}" y="{y + 38}">{esc(sub)}</text>')


def arrow(x1, y1, x2, y2):
    return f'<path class="edge" d="M{x1},{y1} L{x2},{y2}" marker-end="url(#ah)"/>'


# The target, top to bottom. Each item: name, what it does, repo, then "later" if not built yet.
LAYERS = [
  ("8", "Apps", "use the layers below; keep their own rules",
   [("sdlc", "planning corpus", "dev"), ("skillwright", "skills, harness-reference", "sw"),
    ("evidence project", "records + files", "ext")],
   [("determined", "notes app", "dev"), ("markdown-store", "typed records; home open", "ont"),
    ("ontogen", "Rust structs → notes", "ont")]),
  ("7", "Render, edit, sites", "show notes to people",
   [("markdown-render", "notes → HTML", "osdlc"), ("markdown-editor", "live editor", "osdlc"),
    ("markdown-ui", "viewing chrome", "osdlc"), ("markdown-astro", "notes → site", "osdlc")], []),
  ("6", "Query (later)", "read a corpus as a database",
   [("query layer", "Bases queries, loader, builds", "osdlc", "later")], []),
  ("5", "Profiles (proposal)", "shared sets of types",
   [("claims profile", "VA-Spec evidence types", "md", "later"),
    ("acceptance testing", "builds on claims", "md", "later")], []),
  ("4", "corpus-schema", "the spec and its validator",
   [("@osdlc/corpus-schema", "levels 0–2, validate --fix", "md")],
   [("Rust validator", "later, same tests", "md", "later")]),
  ("3", "Corpus model", "every note and link, kept fresh",
   [("markdown-corpus", "from vault + graph", "osdlc", "later")],
   [("markdown-corpus", "the twin", "osdlc"), ("markdown-relink", "move notes, fix links", "osdlc")]),
  ("2", "Note parts", "one note's pieces; one link resolver",
   [("markdown-link", "+ LinkIndex", "osdlc", "later"), ("frontmatter, tags", "lossless edits", "osdlc")],
   [("markdown-link", "LinkIndex", "osdlc"), ("frontmatter, tags", "twins", "osdlc"), ("yaml-splice", "+ wasm binding", "osdlc")]),
  ("1", "Files", "walk, read, write safely",
   [("etag-write, path-guard", "safe writes and paths", "osdlc")],
   [("vault-fs, vfs-walk, seam", "walk any file system", "osdlc"), ("etag-write, path-guard", "the twins", "osdlc")]),
]


def layers():
    # The key needs two rows to fit; the second has no label.
    repos = TARGET_KEY + [("ext", "other")]
    out, y = [key(12, repos[:3]), key(28, repos[3:], label="")], 42
    for num, name, sub, ts, rs in LAYERS:
        top, body, yy = y, [], y + 52
        for lang, items in (("TYPESCRIPT", ts), ("RUST", rs)):
            if not items:
                continue
            body.append(f'<text class="lang" x="{X0 + 2}" y="{yy + 4}">{lang}</text>')
            g, gh = grid(yy + 16, items)
            body.append(g)
            yy += 16 + gh
        h = yy - top + 2
        out.append(f'<rect class="band" x="6" y="{top}" width="{W - 12}" height="{h}" rx="10"/>')
        out.append(f'<text class="lnum" x="{W - 26}" y="{top + 24}" text-anchor="end">{num}</text>'
                   f'<text class="rl" x="{X0}" y="{top + 24}">{esc(name)}</text>'
                   f'<text class="rs" x="{X0}" y="{top + 39}">{esc(sub)}</text>')
        out.extend(body)
        y = top + h + 8
    out.append(f'<text class="cs" x="{X0}" y="{y + 10}">Each layer uses only the layers below it. Dashed: not built yet.</text>'
               f'<text class="cs" x="{X0}" y="{y + 26}">Colour: where each package lives once the moves are done.</text>')
    return svg(STYLE + "".join(out), y + 38, "The layers of the markdown ecosystem, top to bottom")


def settings():
    out = [ARROW, f'<text class="rl" x="{X0}" y="26">Three settings on a corpus</text>',
           f'<text class="rs" x="{X0}" y="44">Each answers a different question. Dialect is a proposal.</text>']
    code = ["# corpus-schema.yaml", "corpus-schema: 0", "level: 2", "dialect: obsidian", "extends:", '  claims: "@osdlc/corpus-profile-claims"',
            '  org: "../org-principles"']
    out.append(f'<g class="code"><rect x="{X0}" y="58" width="{W - 2 * X0}" height="{18 * len(code) + 16}" rx="8"/>')
    out.extend(f'<text x="{X0 + 14}" y="{80 + 18 * i}">{esc(line.replace(chr(32) * 2, chr(160) * 2))}</text>' for i, line in enumerate(code))
    out.append('</g>')
    y = 58 + 18 * len(code) + 34

    out.append(f'<text class="rl" x="{X0}" y="{y}">Level</text><text class="rs" x="{X0 + 52}" y="{y}">how much it declares</text>')
    y += 12
    for i, (t, s) in enumerate([("0", "nothing"), ("1", "root file, folders, ids"), ("2", "a schema per type")]):
        x = X0 + i * 138
        out.append(box(x, y, 130, 48, f"Level {t}", s))
        if i:
            out.append(arrow(x - 7, y + 24, x - 1, y + 24))
    y += 76

    out.append(f'<text class="rl" x="{X0}" y="{y}">Dialect</text><text class="rs" x="{X0 + 64}" y="{y}">syntax beyond the baseline</text>')
    y += 12
    out.append(box(X0, y, 200, 48, "baseline", "every tool; wikilinks warn"))
    out.append(box(X0 + 208, y, 200, 48, "obsidian", "wikilinks, embeds, no warning", "lvl opt"))
    y += 76

    out.append(f'<text class="rl" x="{X0}" y="{y}">Extends</text><text class="rs" x="{X0 + 66}" y="{y}">whose types and records it uses</text>')
    y += 12
    out.append(box(X0, y, 190, 48, "claims", "a profile: types only", "prof"))
    out.append(box(X0 + 218, y, 190, 48, "acceptance testing", "+ build, commit, environment", "prof"))
    out.append(arrow(X0 + 216, y + 24, X0 + 192, y + 24))
    out.append(f'<text class="cs" x="{X0}" y="{y + 66}">acceptance testing builds on claims:</text>'
               f'<text class="cs" x="{X0}" y="{y + 82}">it adds, it never loosens.</text>')
    y += 82
    out.append(box(X0 + 218, y, 190, 48, "your corpus", "its own types + parents"))
    out.append(arrow(X0 + 313, y - 2, X0 + 313, y - 32))
    out.append(f'<text class="cs" x="{X0}" y="{y + 30}">So a record valid under acceptance</text>'
               f'<text class="cs" x="{X0}" y="{y + 46}">testing is also valid under claims.</text>')
    y += 62
    return svg(STYLE + "".join(out), y, "Level, dialect and profiles, with a root file example")


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    for name, text in {"architecture-layers.svg": layers(), "architecture-settings.svg": settings()}.items():
        (OUT / name).write_text(text, encoding="utf-8")
        print(OUT / name)


if __name__ == "__main__":
    main()
