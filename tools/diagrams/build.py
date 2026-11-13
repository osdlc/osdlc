"""Writes the plan's diagrams to docs/architecture/img/markdown/*.svg.

Run from the repo root: python3 tools/diagrams/build.py
Each SVG is standalone, with concrete colours and a dark-mode block. GitHub
shows SVGs through <img>, so the colours follow the viewer's OS colour
scheme, not the GitHub theme setting.
"""
import html
import pathlib

ROOT = pathlib.Path(__file__).resolve().parents[2]
OUT = ROOT / "docs" / "architecture" / "img" / "markdown"

W = 440                    # viewBox width; reads on a phone without zooming
CW, CH, GX, GY = 200, 46, 8, 8
X0 = 16

LIGHT = dict(bg="#fbfaf7", fg="#1d1d1b", mut="#5d5d58", band="#f0eee8", line="#d8d5cc", chip="#ffffff",
             osdlc="#2f855a", md="#b83280", mod="#0e7490", dev="#2b6cb0", ont="#6b46c1", sw="#c05621",
             bad="#c53030", badbg="#fde8e8", acc="#b8741a", accbg="#fde7c8")
DARK = dict(bg="#16161a", fg="#ececea", mut="#a3a39d", band="#222227", line="#3a3a40", chip="#2b2b31",
            osdlc="#68d391", md="#f687b3", mod="#22d3ee", dev="#63b3ed", ont="#b794f4", sw="#f6ad55",
            bad="#fc8181", badbg="#3b1d1d", acc="#f6ad55", accbg="#3d2f1c")


def rules(c):
    return f"""
.bg{{fill:{c['bg']}}} .band{{fill:{c['band']}}}
.rl{{font-size:15px;font-weight:650;fill:{c['fg']}}} .rs{{font-size:12px;fill:{c['mut']}}}
.lang{{font-size:10.5px;font-weight:700;letter-spacing:.06em;fill:{c['mut']}}}
.chip rect{{fill:{c['chip']};stroke-width:1.5}} .chip.later rect{{fill:none;stroke-dasharray:5 4}}
.cn{{font-size:13px;font-weight:650;fill:{c['fg']}}} .cs{{font-size:11px;fill:{c['mut']}}}
.r-osdlc rect{{stroke:{c['osdlc']}}} .r-osdlc .dot{{fill:{c['osdlc']}}}
.r-md rect{{stroke:{c['md']}}} .r-md .dot{{fill:{c['md']}}}
.r-mod rect{{stroke:{c['mod']}}} .r-mod .dot{{fill:{c['mod']}}}
.r-dev rect{{stroke:{c['dev']}}} .r-dev .dot{{fill:{c['dev']}}}
.r-ont rect{{stroke:{c['ont']}}} .r-ont .dot{{fill:{c['ont']}}}
.r-sw rect{{stroke:{c['sw']}}} .r-sw .dot{{fill:{c['sw']}}}
.fb rect{{fill:{c['badbg']};stroke:{c['bad']}}} .fb text{{font-size:10.5px;font-weight:700;fill:{c['bad']}}}
.dup{{stroke:{c['bad']};stroke-width:1.6;stroke-dasharray:4 3}}
.edge{{fill:none;stroke:{c['mut']};stroke-width:1.4}} .ahp{{fill:{c['mut']}}}
.lvl rect{{fill:{c['chip']};stroke:{c['line']}}} .prof rect{{fill:{c['accbg']};stroke:{c['acc']}}}
.refc rect{{fill:{c['chip']};stroke:{c['acc']};stroke-width:1.5}}
.tie{{stroke:{c['acc']};stroke-width:1.6;fill:none}} .tie.ref{{stroke-dasharray:4 3}}"""


def svg(body, height, label):
    style = rules(LIGHT) + "\n@media (prefers-color-scheme: dark) {" + rules(DARK) + "\n}"
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {height}" width="{W * 2}" '
            f'font-family="system-ui, -apple-system, Segoe UI, sans-serif" role="img" aria-label="{esc(label)}">'
            f'<style>{style}</style><rect class="bg" width="{W}" height="{height}"/>{body}</svg>\n')


def esc(s):
    return html.escape(s, quote=True)


ARROW = ('<defs><marker id="ah" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" '
         'orient="auto"><path d="M0,0L10,5L0,10z" class="ahp"/></marker></defs>')


def chip(x, y, name, sub, repo, later=False, faults=(), w=CW):
    cls = f"chip r-{repo}" + (" later" if later else "")
    out = [f'<g class="{cls}"><rect x="{x}" y="{y}" width="{w}" height="{CH}" rx="7"/>',
           f'<circle cx="{x + 12}" cy="{y + 16}" r="4.5" class="dot"/>',
           f'<text x="{x + 22}" y="{y + 20}" class="cn">{esc(name)}</text>',
           f'<text x="{x + 10}" y="{y + 37}" class="cs">{esc(sub)}</text></g>']
    for i, f in enumerate(faults):
        bx = x + w - 14 - i * 27
        out.append(f'<g class="fb"><rect x="{bx - 12}" y="{y - 9}" width="25" height="17" rx="8.5"/>'
                   f'<text x="{bx + 0.5}" y="{y + 3.5}" text-anchor="middle">{esc(f)}</text></g>')
    return "".join(out)


def grid(y, items):
    out = []
    for i, it in enumerate(items):
        r, c = divmod(i, 2)
        name, sub, repo, *rest = it
        later = "later" in rest
        faults = next((x for x in rest if isinstance(x, tuple)), ())
        out.append(chip(X0 + c * (CW + GX), y + r * (CH + GY + 6), name, sub, repo, later, faults))
    return "".join(out), ((len(items) + 1) // 2) * (CH + GY + 6)


KEY = [("osdlc", "osdlc"), ("dev", "dev"), ("ont", "rust-ontogen"), ("sw", "skillwright")]
PRESENT_KEY = [("md", "markdown")] + KEY           # osdlc/models holds nothing yet
TARGET_KEY = [("md", "markdown"), ("mod", "models")] + KEY


def key(y, repos, label="Repo:"):
    out, x = [f'<text class="cs" x="{X0}" y="{y + 4}">{label}</text>'], X0 + 40
    for repo, name in repos:
        out.append(f'<g class="chip r-{repo}"><circle cx="{x}" cy="{y}" r="4.5" class="dot"/></g>'
                   f'<text class="cs" x="{x + 8}" y="{y + 4}">{name}</text>')
        x += 22 + len(name) * 6.6
    return "".join(out)


def key_width(repos):
    return X0 + 40 + sum(22 + len(name) * 6.6 for _, name in repos)


def keys(repos, split=3):
    """The repo key, on two rows when one is too wide. Returns (svg, first band's y)."""
    if key_width(repos) <= W - X0:
        return key(12, repos), 26
    return key(12, repos[:split]) + key(28, repos[split:], label=""), 42


def layers(rows, label, repos=KEY):
    k, y = keys(repos)
    out = [k]
    for name, sub, ts, rs in rows:
        top, body, yy = y, [], y + 52
        for lang, items in (("TYPESCRIPT", ts), ("RUST", rs)):
            if not items:
                continue
            body.append(f'<text class="lang" x="{X0 + 2}" y="{yy + 4}">{lang}</text>')
            g, h = grid(yy + 16, items)
            body.append(g)
            yy += 16 + h
        h = yy - top + 2
        out.append(f'<rect class="band" x="6" y="{top}" width="{W - 12}" height="{h}" rx="10"/>')
        out.append(f'<text class="rl" x="{X0}" y="{top + 24}">{esc(name)}</text>'
                   f'<text class="rs" x="{X0}" y="{top + 39}">{esc(sub)}</text>')
        out.extend(body)
        y = top + h + 10
    return svg("".join(out), y, label)


PRESENT = [
    ("Apps and tools", "who reads notes",
     [("sdlc", "planning corpus", "dev"), ("skillwright build", "skills → plugins", "sw"),
      ("harness-reference", "typed corpus", "sw")],
     [("determined", "notes app", "dev"), ("skillwright CLI", "renames", "sw")]),
    ("Render, edit, sites", "show notes to people",
     [("markdown-render", "Obsidian dialect → HTML", "dev"), ("markdown-editor", "CodeMirror live edit", "dev"),
      ("markdown-astro", "vault → Astro site", "dev", ("F1",)), ("markdown-ui", "Nuxt viewing chrome", "dev", ("F11",))], []),
    ("Query and store", "a db over notes",
     [("markdown-vault-query", "Obsidian Bases engine", "dev", ("F9",)),
      ("query loader", "planned", "osdlc", "later", ("F9",))],
     [("markdown-store", "typed CRUD, lossless", "ont", ("F6", "F7")), ("ontogen", "Rust structs → notes", "ont")]),
    ("Types", "what a record must hold",
     [("model-schema", "packs; on a dev branch", "dev", ("F5",)), ("pack-intent, -sdlc", "sdlc's 14 kinds", "dev", ("F5",)),
      ("corpus-schema", "validator, on npm", "md", ("F5", "F8"))], []),
    ("Corpus model", "every note, link, backlink",
     [("markdown-vault", "scan + resolve + backlinks", "dev", ("F1", "F4")),
      ("vault-graph-core", "resolve + nodes/edges", "dev", ("F1", "F11"))],
     [("markdown-corpus", "graph, backlinks, refresh", "osdlc", ("F4",)),
      ("markdown-relink", "move notes, fix links", "osdlc")]),
    ("Note parts", "one note's pieces",
     [("markdown-link", "parse; no resolver", "osdlc", ("F2", "F3")), ("frontmatter-lossless", "split, rewrite", "osdlc"),
      ("markdown-contract", "one doc's structure", "osdlc"), ("markdown-tags", "#tags, 3 dialects", "osdlc"),
      ("gfm-table", "pipe tables", "osdlc"), ("yaml-splice", "edit YAML in place", "osdlc"),
      ("markdown-link copy", "dev, private 0.1.0", "dev", ("F11",))],
     [("markdown-link", "parse + LinkIndex", "osdlc"), ("frontmatter-lossless", "twin", "osdlc"),
      ("markdown-contract", "twin", "osdlc"), ("markdown-tags", "twin", "osdlc"),
      ("gfm-pipe-table", "twin", "osdlc"), ("yaml-splice", "twin + wasm", "osdlc")]),
    ("Files", "walk, read, write",
     [("etag-write", "atomic writes", "osdlc"), ("path-guard", "safe paths", "osdlc")],
     [("markdown-vault-fs", "walk, exclusions", "osdlc"), ("vfs-walk", "walk a folder", "osdlc"),
      ("vfs-seam", "file system seam", "osdlc"), ("etag-write", "twin", "osdlc"),
      ("path-guard", "twin", "osdlc")]),
]

TARGET = [
    ("Apps and tools", "read only through osdlc packages",
     [("sdlc", "types from profiles", "dev"), ("skillwright, harness-ref", "spec corpora", "sw")],
     [("determined", "corpus model", "dev"), ("skillwright CLI", "corpus model", "sw")]),
    ("Render, edit, sites", "in osdlc/osdlc for now",
     [("markdown-render", "", "osdlc"), ("markdown-editor", "", "osdlc"),
      ("markdown-astro", "", "osdlc"), ("markdown-ui", "", "osdlc")], []),
    ("Query: the db layer (D5)", "one read layer over the corpus model",
     [("query layer", "Bases + loader, one model", "osdlc")],
     [("markdown-store", "writes the spec layout", "ont")]),
    ("Profiles and starters (D17)", "in osdlc/models, published to npm",
     [("claims profile", "VA-Spec types", "mod"), ("sdlc profile", "intent and sdlc kinds", "mod"),
      ("sdlc starter", "records to reference", "mod")], []),
    ("The model (D13)", "packs, above the store spec",
     [("model-schema", "packs → profiles", "mod"), ("packs", "intent, sdlc, claims", "mod")], []),
    ("The spec (D4)", "in this repo, one type format",
     [("corpus-schema", "extends, uses, references", "md")], []),
    ("Corpus model", "one per language, one family",
     [("markdown-corpus", "vault + graph merged", "osdlc")],
     [("markdown-corpus", "twin", "osdlc"), ("markdown-relink", "", "osdlc")]),
    ("Note parts", "twins, one resolver rule",
     [("markdown-link", "+ LinkIndex, all links", "osdlc"), ("other parts", "unchanged twins", "osdlc")],
     [("markdown-link", "LinkIndex, twin", "osdlc"), ("other parts", "unchanged twins", "osdlc")]),
    ("Files", "unchanged", [("etag-write, path-guard", "", "osdlc")], [("vault-fs, walk, seam", "", "osdlc")]),
]


def resolvers():
    rows = [("markdown-vault", "own shortest-path rule", "dev"),
            ("vault-graph-core", "port of the Rust LinkIndex", "dev"),
            ("markdown-astro", "first match; embeds by name", "dev"),
            ("corpus-schema", "own walk and link check", "md"),
            ("markdown-store", "own [[id]] wikilink code", "ont")]
    out = [f'<text class="rl" x="{X0}" y="26">Who decides what a link points to</text>']
    y = 44
    for n, s, r in rows:
        out.append(chip(X0, y, n, s, r, w=250))
        out.append(f'<line class="dup" x1="{X0 + 252}" y1="{y + 23}" x2="300" y2="{y + 23}"/>')
        y += 58
    mid = 44 + (len(rows) * 58 - 12) / 2
    out.append(f'<line class="dup" x1="300" y1="67" x2="300" y2="{44 + (len(rows) - 1) * 58 + 23}"/>')
    out.append(f'<g class="fb"><rect x="308" y="{mid - 34}" width="118" height="68" rx="10"/>'
               f'<text x="367" y="{mid - 12}" text-anchor="middle">5 rules for</text>'
               f'<text x="367" y="{mid + 6}" text-anchor="middle">one question</text>'
               f'<text x="367" y="{mid + 24}" text-anchor="middle">F1 F2 F7 F8</text></g>')
    return svg("".join(out), y + 4, "Five places resolve links")


def levels_profiles():
    out = [f'<text class="rl" x="{X0}" y="26">Levels, parents and references</text>',
           f'<text class="rs" x="{X0}" y="44">Levels: how much a corpus declares.</text>',
           f'<text class="rs" x="{X0}" y="60">Parents give types. Referenced corpora give records.</text>']
    lw, rx, rw, top = 200, 246, 180, 76
    lv = [("2 · Typed", "every type has a JSON Schema"),
          ("1 · Records", "a root file, type folders, ids"),
          ("0 · Linked notes", "declares nothing; any vault")]
    y = top
    for t, s in lv:
        out.append(f'<g class="lvl"><rect x="{X0}" y="{y}" width="{lw}" height="50" rx="8"/></g>'
                   f'<text class="cn" x="{X0 + 12}" y="{y + 21}">{esc(t)}</text>'
                   f'<text class="cs" x="{X0 + 12}" y="{y + 38}">{esc(s)}</text>')
        y += 60
    # Each right-hand box: title, subtitle, class, and the y of the level box it ties to.
    right = [("claims profile", "types, by extends or uses", "prof", top),
             ("sdlc profile", "types, by extends or uses", "prof", top),
             ("sdlc starter", "records, by references", "refc", top + 120)]
    py = top
    for t, s, cls, ly in right:
        tie = "tie ref" if cls == "refc" else "tie"
        out.append(f'<g class="{cls}"><rect x="{rx}" y="{py}" width="{rw}" height="50" rx="8"/></g>'
                   f'<text class="cn" x="{rx + 12}" y="{py + 21}">{esc(t)}</text>'
                   f'<text class="cs" x="{rx + 12}" y="{py + 38}">{esc(s)}</text>')
        out.append(f'<path class="{tie}" d="M{rx},{py + 25} C{rx - 14},{py + 25} {rx - 14},{ly + 25} {X0 + lw + 1},{ly + 25}"/>')
        py += 60
    notes = ["extends and uses need level 2. references works at any level:",
             "sync copies the records into _references/<prefix>/.",
             "A corpus can name several of each, next to its own types."]
    for i, n in enumerate(notes):
        out.append(f'<text class="cs" x="{X0}" y="{y + 10 + 16 * i}">{esc(n)}</text>')
    return svg("".join(out), y + 10 + 16 * len(notes) + 4,
               "Levels 0 to 2; profiles that give types through extends and uses; a starter corpus that gives records through references")


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    files = {
        "present.svg": layers(PRESENT, "Present state by layer", PRESENT_KEY),
        "resolvers.svg": resolvers(),
        "levels-profiles.svg": levels_profiles(),
        "target.svg": layers(TARGET, "Target state by layer", TARGET_KEY),
    }
    for name, text in files.items():
        (OUT / name).write_text(text, encoding="utf-8")
        print(OUT / name)


if __name__ == "__main__":
    main()
