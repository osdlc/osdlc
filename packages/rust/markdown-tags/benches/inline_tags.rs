//! Gated benchmarks for `inline_tags` on the shared synthetic corpus, one group
//! per dialect.
//!
//! The corpus is built by `bench/corpus/cli.ts` and read from the JSON file
//! named by `OSDLC_BENCH_CORPUS`; `scripts/perf-gate.ts` and
//! `node bench/corpus/cli.ts <file>` write it. The TypeScript twin,
//! `packages/ts/markdown-tags/benches/inline-tags.bench.ts`, times the same
//! cases under the same names. See `bench/README.md`.
#![allow(missing_docs)]

use std::hint::black_box;
use std::time::Duration;

use criterion::{Criterion, criterion_group, criterion_main};
use markdown_tags::{TagDialect, inline_tags};
use serde_json::Value;

fn strings(corpus: &Value, key: &str) -> Vec<String> {
    corpus[key]
        .as_array()
        .unwrap_or_else(|| panic!("corpus has no `{key}` array"))
        .iter()
        .map(|v| v.as_str().expect("a corpus body is a string").to_owned())
        .collect()
}

fn load() -> Value {
    let path = std::env::var("OSDLC_BENCH_CORPUS")
        .expect("OSDLC_BENCH_CORPUS must name the corpus file: node bench/corpus/cli.ts <file>");
    let text = std::fs::read_to_string(&path).unwrap_or_else(|e| panic!("read {path}: {e}"));
    serde_json::from_str(&text).expect("the corpus file is JSON")
}

fn tags(c: &mut Criterion) {
    let corpus = load();
    let bodies = strings(&corpus, "bodies");
    let largest = corpus["largest"].as_str().expect("corpus has `largest`");

    for &dialect in TagDialect::ALL {
        let mut group = c.benchmark_group(format!("inline_tags {}", dialect.as_str()));
        group.bench_function("vault", |b| {
            b.iter(|| {
                for body in &bodies {
                    black_box(inline_tags(black_box(body), dialect));
                }
            })
        });
        group.bench_function("largest-note", |b| {
            b.iter(|| black_box(inline_tags(black_box(largest), dialect)))
        });
        for case in corpus["slow"].as_array().expect("corpus has `slow`") {
            let name = case["name"].as_str().expect("a slow case has a name");
            let body = case["body"].as_str().expect("a slow case has a body");
            group.bench_function(name, |b| {
                b.iter(|| black_box(inline_tags(black_box(body), dialect)))
            });
        }
        group.finish();
    }
}

criterion_group! {
    name = benches;
    config = Criterion::default()
        .sample_size(30)
        .warm_up_time(Duration::from_secs(1))
        .measurement_time(Duration::from_secs(2));
    targets = tags
}
criterion_main!(benches);
