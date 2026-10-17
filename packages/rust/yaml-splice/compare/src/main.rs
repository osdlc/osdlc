use std::collections::BTreeMap;
use std::panic::{AssertUnwindSafe, catch_unwind};
use std::str::FromStr;
use yaml_splice::{FieldEdit, Mapping, Value, edit_yaml, parse};

/// The checker's parser. A leading BOM is stripped first, so neither crate is
/// marked wrong for keeping it.
fn parse_mapping(s: &str) -> Result<Mapping, parse::ParseError> {
    parse::parse_mapping(s.strip_prefix('\u{feff}').unwrap_or(s))
}

#[derive(Clone, Debug)]
enum Op {
    Set(String, NV),
    Remove(String),
}
#[derive(Clone, Debug)]
enum NV {
    S(&'static str),
    I(i64),
    F(f64),
}
impl NV {
    fn val(&self) -> Value {
        match self {
            NV::S(s) => Value::from(*s),
            NV::I(i) => Value::Int(*i),
            NV::F(f) => Value::Float(*f),
        }
    }
}

fn ye(src: &str, op: &Op) -> Result<String, String> {
    let r = catch_unwind(AssertUnwindSafe(|| {
        let file = yaml_edit::YamlFile::from_str(src).map_err(|e| format!("parse: {e}"))?;
        let d = file.document().ok_or("no document")?;
        let m = d.as_mapping().ok_or("no mapping")?;
        match op {
            Op::Set(k, NV::S(s)) => m.set(k.as_str(), *s),
            Op::Set(k, NV::I(i)) => m.set(k.as_str(), *i),
            Op::Set(k, NV::F(f)) => m.set(k.as_str(), *f),
            Op::Remove(k) => {
                m.remove(k.as_str());
            }
        }
        Ok(file.to_string())
    }));
    match r {
        Ok(x) => x,
        Err(_) => Err("PANIC".into()),
    }
}
fn ys(src: &str, op: &Op) -> Result<String, String> {
    let e = match op {
        Op::Set(k, v) => FieldEdit::Set {
            key: k.clone(),
            value: v.val(),
        },
        Op::Remove(k) => FieldEdit::Remove { key: k.clone() },
    };
    edit_yaml(src.as_bytes(), &[e])
        .map(|o| String::from_utf8(o.bytes).unwrap())
        .map_err(|e| format!("{e}"))
}
fn want(orig: &Mapping, op: &Op) -> Mapping {
    let mut w = orig.clone();
    match op {
        Op::Set(k, v) => {
            w.insert(k.as_str(), v.val());
        }
        Op::Remove(k) => {
            w.remove(k);
        }
    }
    w
}

const VALUES: &[&str] = &[
    "1",
    "'q' # c",
    "\"d\"",
    "plain words # c",
    "[a, 'b'] # c",
    "{x: 1} # c",
    "\n  - a\n  - 'b' # c\n  - |\n    blk\n",
    "\n  k: v\n  k2: |\n    z\n\n",
    "|\n  l1\n\n  l2\n",
    "|-\n  stripped\n",
    ">+\n  f\n\n",
    "",
    "'multi\n  line'",
    "\"esc \\\" q\" #c",
    "!!str 7",
    "|2\n   indented\n",
    "null # c",
    "\n  # only comment\n  a: 1\n",
    "|",
    "| # c\n  x\n",
    "|\n    x\n  # note",
    ">-\n    deep\n # one space\n",
    "\n    - a\n  # less\n    - b\n",
    "!!str | # c",
    "&x >-\n  y\n",
];
const SEPS: &[&str] = &["", "# between\n", "\n"];

fn main() {
    // 1. Hand-picked tricky inputs.
    let cases: Vec<(&str, &str, Op)> = vec![
        (
            "block scalar with header comment, set it",
            "first: | # c\n  x\nsecond: 1\n",
            Op::Set("first".into(), NV::S("Z")),
        ),
        (
            "block scalar with header comment, set neighbour",
            "first: | # c\n  x\nsecond: 1\n",
            Op::Set("second".into(), NV::S("Z")),
        ),
        (
            "keep-chomped |+ neighbour, set next key",
            "first: |+\n  kept\n\n\nsecond: 1\n",
            Op::Set("second".into(), NV::S("Z")),
        ),
        (
            "keep-chomped |+, remove it",
            "first: |+\n  kept\n\n\nsecond: 1\n",
            Op::Remove("first".into()),
        ),
        (
            "write |+ value with trailing blank lines",
            "first: a\nsecond: 1\n",
            Op::Set("first".into(), NV::S("kept\n\n\n")),
        ),
        (
            "multi-line single-quoted value, set it",
            "first: 'multi\n  line'\nsecond: x\n",
            Op::Set("first".into(), NV::S("Z")),
        ),
        (
            "multi-line string as new value",
            "first: a # c\nsecond: x\n",
            Op::Set("first".into(), NV::S("line1\nline2\n")),
        ),
        (
            "trailing bare | at end, set it",
            "first: x\nlast: |",
            Op::Set("last".into(), NV::S("Z")),
        ),
        (
            "trailing bare | at end, remove previous",
            "first: x\nlast: |",
            Op::Remove("first".into()),
        ),
        (
            "trailing bare | then remove it",
            "first: x\nlast: |\n",
            Op::Remove("last".into()),
        ),
        (
            "trailing > at end, set neighbour",
            "first: x\nlast: >\n",
            Op::Set("first".into(), NV::S("Z")),
        ),
        (
            "less-indented comment in block, set it",
            "first: |\n    x\n  # note\nsecond: 1\n",
            Op::Set("first".into(), NV::S("a\nb\n")),
        ),
        (
            "less-indented comment in block, remove next",
            "first: |\n    x\n  # note\nsecond: 1\nthird: 2\n",
            Op::Remove("second".into()),
        ),
        (
            "no-op set of equal value",
            "title: 'Draft'   # keep\ntags: [a, b]\n",
            Op::Set("title".into(), NV::S("Draft")),
        ),
        (
            "set with trailing comment kept",
            "status: draft   # draft | review\nx: 1\n",
            Op::Set("status".into(), NV::S("review")),
        ),
        (
            "append new key",
            "# head\na: 1\nb: [x, y]\n",
            Op::Set("due".into(), NV::S("2026-11-02")),
        ),
        (
            "CRLF append",
            "a: 1\r\nb: 2\r\n",
            Op::Set("c".into(), NV::S("3")),
        ),
        (
            "BOM kept",
            "\u{feff}a: 1\nb: 2\n",
            Op::Set("a".into(), NV::I(5)),
        ),
        (
            "frontmatter unterminated last line",
            "a: 1\nb: 2",
            Op::Set("c".into(), NV::S("x")),
        ),
    ];
    println!("## Hand-picked cases\n");
    for (name, src, op) in &cases {
        let orig = parse_mapping(src).ok();
        let e = ye(src, op);
        let s = ys(src, op);
        let ok = |r: &Result<String, String>| match (r, &orig) {
            (Ok(t), Some(o)) => {
                if parse_mapping(t).ok().as_ref() == Some(&want(o, op)) {
                    "correct"
                } else {
                    "WRONG"
                }
            }
            (Ok(_), None) => "orig-unparseable",
            (Err(_), _) => "refused/err",
        };
        println!(
            "### {name}\nsrc: {src:?}\nop: {op:?}\nyaml-edit  [{}]: {e:?}\nyaml-splice[{}]: {s:?}\n",
            ok(&e),
            ok(&s)
        );
    }

    // 2. The neighbours sweep, run through yaml-edit.
    let nvs = [
        NV::S("Z"),
        NV::S("line1\nline2\n"),
        NV::S("no final break\nend"),
        NV::S("kept\n\n\n"),
        NV::F(1.5),
        NV::I(7),
    ];
    let (
        mut checked,
        mut correct,
        mut wrong,
        mut errs,
        mut panics,
        mut noop_identical,
        mut noop_total,
        mut noop_errors,
    ) = (0, 0, 0, 0, 0, 0, 0, 0);
    let mut s_correct = 0;
    let mut s_refused = 0;
    let mut s_wrong = 0;
    let mut wrong_by_value: BTreeMap<String, usize> = BTreeMap::new();
    let mut samples = Vec::new();
    for eol in ["\n", "\r\n"] {
        for a in VALUES {
            for b in VALUES {
                for sep in SEPS {
                    let src =
                        format!("first: {a}\n{sep}second: {b}\nlast: end # t\n").replace('\n', eol);
                    let Ok(orig) = parse_mapping(&src) else {
                        continue;
                    };
                    for key in ["first", "second", "last"] {
                        let mut ops = vec![Op::Remove(key.into())];
                        for v in &nvs {
                            ops.push(Op::Set(key.into(), v.clone()));
                        }
                        for op in ops {
                            checked += 1;
                            let w = want(&orig, &op);
                            match ye(&src, &op) {
                                Ok(t) => {
                                    if parse_mapping(&t).ok().as_ref() == Some(&w) {
                                        correct += 1
                                    } else {
                                        wrong += 1;
                                        *wrong_by_value
                                            .entry(format!(
                                                "{:?}",
                                                match &op {
                                                    Op::Remove(_) => "Remove".to_string(),
                                                    Op::Set(_, v) => format!("Set {v:?}"),
                                                }
                                            ))
                                            .or_insert(0) += 1;
                                        if samples.len() < 12 {
                                            samples.push(format!("{op:?} on {src:?}\n  -> {t:?}"));
                                        }
                                    }
                                }
                                Err(e) if e == "PANIC" => panics += 1,
                                Err(_) => errs += 1,
                            }
                            match ys(&src, &op) {
                                Ok(t) => {
                                    if parse_mapping(&t).ok().as_ref() == Some(&w) {
                                        s_correct += 1
                                    } else {
                                        s_wrong += 1
                                    }
                                }
                                Err(_) => s_refused += 1,
                            }
                        }
                    }
                    // no-op: set `last` to its current value "end"
                    noop_total += 1;
                    match ye(&src, &Op::Set("last".into(), NV::S("end"))) {
                        Ok(t) if t == src => noop_identical += 1,
                        Ok(_) => {}
                        Err(_) => noop_errors += 1,
                    }
                }
            }
        }
    }
    println!(
        "## Neighbours sweep\n\nchecked={checked}\nyaml-edit: correct={correct} wrong(silent)={wrong} error={errs} panic={panics}\nyaml-splice: correct={s_correct} refused={s_refused} wrong(silent)={s_wrong}\nyaml-edit no-op byte-identical: {noop_identical}/{noop_total} (parse errors: {noop_errors}, non-identical: {})\nyaml-edit wrong by op: {wrong_by_value:?}\n",
        noop_total - noop_identical - noop_errors
    );
    // breakdown
    let mut by: BTreeMap<String, usize> = BTreeMap::new();
    let mut ex: BTreeMap<String, String> = BTreeMap::new();
    for eol in ["\n", "\r\n"] {
        for a in VALUES {
            for b in VALUES {
                for sep in SEPS {
                    let src =
                        format!("first: {a}\n{sep}second: {b}\nlast: end # t\n").replace('\n', eol);
                    let Ok(orig) = parse_mapping(&src) else {
                        continue;
                    };
                    for key in ["first", "second", "last"] {
                        for op in [Op::Set(key.into(), NV::S("Z")), Op::Remove(key.into())] {
                            let w = want(&orig, &op);
                            let tag = match &op {
                                Op::Remove(_) => "Remove",
                                _ => "SetZ",
                            };
                            let (cls, out) = match ye(&src, &op) {
                                Ok(t) => {
                                    if parse_mapping(&t).ok().as_ref() == Some(&w) {
                                        continue;
                                    } else {
                                        ("wrong", format!("{t:?}"))
                                    }
                                }
                                Err(e) => ("err", e),
                            };
                            let k = format!("{tag} {cls} eol={:?}", eol);
                            *by.entry(k.clone()).or_insert(0) += 1;
                            ex.entry(format!("{k} {}", &out.chars().take(60).collect::<String>()))
                                .or_insert(format!("{src:?} -> {out}"));
                        }
                    }
                }
            }
        }
    }
    println!("## Breakdown (SetZ/Remove)\n{by:#?}\n");
    for (i, (k, v)) in ex.iter().enumerate() {
        if k.starts_with("SetZ wrong") || i < 3 {
            println!("{k}\n  {v}\n");
        }
    }
    println!("## Sample yaml-edit wrong results\n");
    for s in samples {
        println!("{s}\n");
    }
}
