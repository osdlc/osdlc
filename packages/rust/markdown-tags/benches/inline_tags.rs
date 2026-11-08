//! `inline_tags` on a synthetic note, in each dialect, with and without link
//! syntax. The body generator matches `bench/corpus.ts` in the TypeScript
//! twin. Run with `cargo bench -p markdown-tags`.

use std::hint::black_box;

use criterion::{Criterion, criterion_group, criterion_main};
use markdown_tags::{TagDialect, inline_tags};

const WORDS: [&str; 10] = [
    "alpha", "draft", "plan", "review", "notes", "santé", "daily", "idea", "todo", "log",
];

/// A linear congruential generator, so every run builds the same body.
struct Lcg(u32);

impl Lcg {
    fn next(&mut self) -> f64 {
        self.0 = self.0.wrapping_mul(1_664_525).wrapping_add(1_013_904_223);
        f64::from(self.0) / 4_294_967_296.0
    }

    fn word(&mut self) -> &'static str {
        WORDS[(self.next() * WORDS.len() as f64) as usize]
    }
}

fn paragraph(rng: &mut Lcg, links: bool) -> String {
    let mut parts: Vec<String> = Vec::new();
    for _ in 0..40 {
        let roll = rng.next();
        parts.push(if roll < 0.1 {
            format!("#{}/{}", rng.word(), rng.word())
        } else if roll < 0.15 {
            format!("(#{})", rng.word())
        } else if roll < 0.18 {
            format!("#{}", 2000 + (rng.next() * 30.0) as u32)
        } else if roll < 0.22 {
            format!("`#{}`", rng.word())
        } else if links && roll < 0.28 {
            format!("[{}](notes/{}.md#{})", rng.word(), rng.word(), rng.word())
        } else if links && roll < 0.3 {
            format!("[[{}#{}|{}]]", rng.word(), rng.word(), rng.word())
        } else {
            rng.word().to_owned()
        });
    }
    parts.join(" ")
}

/// A note body of about `kilobytes` KB.
fn note_body(kilobytes: usize, links: bool) -> String {
    let mut rng = Lcg(7);
    let mut blocks: Vec<String> = Vec::new();
    let mut size = 0;
    while size < kilobytes * 1000 {
        let block = if rng.next() < 0.12 {
            format!("```ts\nconst tag = '#{}'\n```", rng.word())
        } else {
            paragraph(&mut rng, links)
        };
        size += block.len() + 2;
        blocks.push(block);
    }
    if links {
        blocks.push("[ref]: notes/ref.md \"title #in-title\"".to_owned());
    }
    blocks.join("\n\n") + "\n"
}

fn bench_inline_tags(c: &mut Criterion) {
    for (shape, links) in [("no links", false), ("with links", true)] {
        let body = note_body(8, links);
        let mut group = c.benchmark_group(format!("inline_tags, 8 KB note, {shape}"));
        for dialect in TagDialect::ALL {
            group.bench_function(dialect.as_str(), |b| {
                b.iter(|| inline_tags(black_box(&body), dialect));
            });
        }
        group.finish();
    }
}

criterion_group!(benches, bench_inline_tags);
criterion_main!(benches);
