//! Runs the etag-write conformance suite, `packages/conformance/etag-write/suite.json`.
//!
//! The suite holds the cases this crate and the TypeScript `@osdlc/etag-write`
//! package must agree on: same input, same result. The TypeScript package is
//! the family's reference: its generator writes every `expect` and `error`. A
//! case added on either side goes in the suite, never in one package's own
//! tests. Every section and every case runs here, unless the case names
//! another platform. The suite's sections must be exactly [`SECTIONS`], and a
//! case key or input key this test does not know fails it, on every host,
//! whether or not the case runs there. An `error` holds its kind only: the
//! two implementations' messages differ by design.
//!
//! Each case builds what its `existing` says in a scratch directory, calls the
//! function, and compares the result and the file afterwards. A write also
//! checks that no temp file is left beside the target.
//!
//! An integration test, not a unit test, so it uses only the public API.

use std::collections::BTreeMap;
use std::fs;
use std::path::{Path, PathBuf};

use etag_write::{WriteError, etag, etag_of_file, write_atomic, write_cas, write_if_changed};
use serde::Deserialize;
use serde::de::DeserializeOwned;
use serde_json::{Value, json};

/// Compiled in rather than read at runtime: the test binary then carries the
/// suite, and a moved or deleted suite is a build error, not a late panic.
const SUITE_JSON: &str = include_str!("../../../conformance/etag-write/suite.json");

#[derive(Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct Suite {
    family: String,
    reference: String,
    #[allow(
        dead_code,
        reason = "the suite format carries it; this test reads none"
    )]
    reference_version: String,
    sections: BTreeMap<String, Section>,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Section {
    #[allow(dead_code, reason = "prose for the reader")]
    description: String,
    cases: Vec<Case>,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Case {
    name: String,
    input: Value,
    #[serde(default)]
    expect: Option<Value>,
    #[serde(default)]
    error: Option<ErrorKind>,
    #[serde(default)]
    platforms: Option<Vec<String>>,
    #[serde(default)]
    skip: BTreeMap<String, String>,
}

/// Rejects a `message`: the suite compares error kinds only.
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct ErrorKind {
    kind: String,
}

/// What a case gives: its `expect`, or the kind of its `error`.
type Outcome = Result<Value, String>;

const HOST: &str = if cfg!(windows) { "windows" } else { "unix" };

impl Case {
    /// Whether the case names this host, or names no platform.
    fn for_this_host(&self) -> bool {
        self.platforms
            .as_ref()
            .is_none_or(|platforms| platforms.iter().any(|p| p == HOST))
    }

    fn input<T: DeserializeOwned>(&self) -> T {
        serde_json::from_value(self.input.clone())
            .unwrap_or_else(|err| panic!("{}: input: {err}", self.name))
    }

    fn want(&self) -> Outcome {
        match (&self.expect, &self.error) {
            (Some(expect), None) => Ok(expect.clone()),
            (None, Some(error)) => Err(error.kind.clone()),
            _ => panic!("{}: a case sets exactly one of expect and error", self.name),
        }
    }
}

/// Bytes: text, taken as UTF-8, or `{ "hex": ... }` for bytes that are not text.
#[derive(Deserialize, Clone)]
#[serde(untagged, deny_unknown_fields)]
enum Data {
    Text(String),
    Hex { hex: String },
}

impl Data {
    fn bytes(&self) -> Vec<u8> {
        match self {
            Self::Text(text) => text.clone().into_bytes(),
            Self::Hex { hex } => from_hex(hex),
        }
    }
}

/// What is at the target path before a case runs.
#[derive(Deserialize)]
#[serde(untagged, deny_unknown_fields)]
enum Existing {
    Directory {
        #[allow(dead_code, reason = "the key that names this variant")]
        directory: bool,
    },
    Data(Data),
}

/// An etag to send: a literal, or the etag of some data.
#[derive(Deserialize)]
#[serde(untagged, deny_unknown_fields)]
enum Sent {
    OfData {
        #[serde(rename = "etagOf")]
        etag_of: Data,
    },
    Literal(String),
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct DataInput {
    data: Data,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct EtagOfFileInput {
    existing: Option<Existing>,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct WriteCasInput {
    existing: Option<Existing>,
    /// `null` and an absent key both mean no etag.
    expected_etag: Option<Sent>,
    content: Data,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct WriteIfChangedInput {
    existing: Option<Existing>,
    content: Data,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct WriteAtomicInput {
    existing: Option<Existing>,
    path: Option<String>,
    content: Data,
}

/// Parsed on every host by `check_input`; only the unix runner reads the fields.
#[cfg_attr(not(unix), allow(dead_code))]
#[derive(Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct WriteAtomicModeInput {
    existing_mode: String,
    content: Data,
}

/// Parsed on every host by `check_input`; only the unix runner reads the fields.
#[cfg_attr(not(unix), allow(dead_code))]
#[derive(Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct WriteAtomicSymlinkInput {
    linked_content: Data,
    content: Data,
}

fn from_hex(hex: &str) -> Vec<u8> {
    assert!(hex.len().is_multiple_of(2), "odd-length hex: {hex}");
    (0..hex.len())
        .step_by(2)
        .map(|i| u8::from_str_radix(&hex[i..i + 2], 16).expect("hex digits"))
        .collect()
}

/// Text when `bytes` are UTF-8, else `{ "hex": ... }`, as the suite spells them.
fn from_bytes(bytes: Vec<u8>) -> Value {
    match String::from_utf8(bytes) {
        Ok(text) => json!(text),
        Err(err) => {
            let hex: String = err
                .into_bytes()
                .iter()
                .map(|b| format!("{b:02x}"))
                .collect();
            json!({ "hex": hex })
        }
    }
}

fn content_of(target: &Path) -> Value {
    from_bytes(fs::read(target).expect("the file is there"))
}

const DEFAULT_PATH: &str = "target.txt";

/// Every file and directory under `root`, sorted and `/`-separated.
fn entries(root: &Path) -> Vec<String> {
    fn walk(root: &Path, rel: &str, out: &mut Vec<String>) {
        let mut names: Vec<String> = fs::read_dir(root.join(rel))
            .expect("the directory lists")
            .map(|e| {
                e.expect("an entry")
                    .file_name()
                    .to_string_lossy()
                    .into_owned()
            })
            .collect();
        names.sort();
        for name in names {
            let path = if rel.is_empty() {
                name
            } else {
                format!("{rel}/{name}")
            };
            out.push(path.clone());
            if root.join(&path).is_dir() {
                walk(root, &path, out);
            }
        }
    }
    let mut out = Vec::new();
    walk(root, "", &mut out);
    out.sort();
    out
}

/// Builds `existing` at `path` in a fresh scratch directory and returns both.
fn scratch(path: &str, existing: Option<&Existing>) -> (tempfile::TempDir, PathBuf) {
    let dir = tempfile::tempdir().expect("a scratch directory");
    let target = dir.path().join(path);
    if let Some(existing) = existing {
        fs::create_dir_all(target.parent().expect("a parent")).expect("parents");
        match existing {
            Existing::Directory { .. } => fs::create_dir(&target).expect("a directory"),
            Existing::Data(data) => fs::write(&target, data.bytes()).expect("a file"),
        }
    }
    (dir, target)
}

/// The kind a write refusal or failure has in the suite.
fn write_kind(e: &WriteError) -> String {
    match e {
        WriteError::Conflict { .. } => "changed",
        WriteError::ExistsWithoutEtag { .. } => "exists_without_etag",
        WriteError::Io { .. } => "io",
        other => panic!("a WriteError the suite has no kind for: {other:?}"),
    }
    .to_string()
}

fn check_entries(section: &str, dir: &Path, want: &[String]) -> Result<(), String> {
    let got = entries(dir);
    if got == want {
        Ok(())
    } else {
        Err(format!(
            "{section}: expected {want:?} under the scratch directory, got {got:?}"
        ))
    }
}

/// Every section this test runs. The suite's sections must be exactly these.
const SECTIONS: [&str; 7] = [
    "etag",
    "etag_of_file",
    "write_cas",
    "write_if_changed",
    "write_atomic",
    "write_atomic_mode",
    "write_atomic_symlink",
];

/// Fails on an input key this section does not know, whether or not the case
/// runs here: `deny_unknown_fields` does it when the input is parsed.
fn check_input(section: &str, case: &Case) {
    match section {
        "etag" => drop(case.input::<DataInput>()),
        "etag_of_file" => drop(case.input::<EtagOfFileInput>()),
        "write_cas" => drop(case.input::<WriteCasInput>()),
        "write_if_changed" => drop(case.input::<WriteIfChangedInput>()),
        "write_atomic" => drop(case.input::<WriteAtomicInput>()),
        "write_atomic_mode" => drop(case.input::<WriteAtomicModeInput>()),
        "write_atomic_symlink" => drop(case.input::<WriteAtomicSymlinkInput>()),
        other => panic!("the suite has a section this test does not know: {other}"),
    }
}

/// The outcome this crate gives for one case of a section, on this host.
fn run(section: &str, case: &Case) -> Result<Outcome, String> {
    match section {
        "etag" => {
            let input: DataInput = case.input();
            Ok(Ok(json!({ "etag": etag(&input.data.bytes()) })))
        }
        "etag_of_file" => {
            let input: EtagOfFileInput = case.input();
            let (_dir, target) = scratch(DEFAULT_PATH, input.existing.as_ref());
            Ok(match etag_of_file(&target) {
                Ok(tag) => Ok(json!({ "etag": tag })),
                Err(_) => Err("io".to_string()),
            })
        }
        "write_cas" => {
            let input: WriteCasInput = case.input();
            let (dir, target) = scratch(DEFAULT_PATH, input.existing.as_ref());
            let before = entries(dir.path());
            let sent = input.expected_etag.map(|s| match s {
                Sent::Literal(tag) => tag,
                Sent::OfData { etag_of } => etag(&etag_of.bytes()),
            });
            let got = match write_cas(&target, &input.content.bytes(), sent.as_deref()) {
                Ok(tag) => Ok(json!({ "etag": tag, "content": content_of(&target) })),
                Err(e) => Err(write_kind(&e)),
            };
            match &got {
                // A refusal leaves the file as it was; a write leaves the target and nothing else.
                Err(_) => {
                    check_entries(section, dir.path(), &before)?;
                    if let Some(Existing::Data(old)) = &input.existing
                        && fs::read(&target).expect("the file is there") != old.bytes()
                    {
                        return Err(format!("{section}: a refused write changed the file"));
                    }
                }
                Ok(_) => check_entries(section, dir.path(), &[DEFAULT_PATH.to_string()])?,
            }
            Ok(got)
        }
        "write_if_changed" => {
            let input: WriteIfChangedInput = case.input();
            let (dir, target) = scratch(DEFAULT_PATH, input.existing.as_ref());
            let before = entries(dir.path());
            let got = match write_if_changed(&target, &input.content.bytes()) {
                Ok(wrote) => Ok(json!({ "wrote": wrote, "content": content_of(&target) })),
                Err(e) => Err(write_kind(&e)),
            };
            let want = if got.is_err() {
                before
            } else {
                vec![DEFAULT_PATH.to_string()]
            };
            check_entries(section, dir.path(), &want)?;
            Ok(got)
        }
        "write_atomic" => {
            let input: WriteAtomicInput = case.input();
            let path = input.path.as_deref().unwrap_or(DEFAULT_PATH);
            let (dir, target) = scratch(path, input.existing.as_ref());
            let before = entries(dir.path());
            let got = match write_atomic(&target, &input.content.bytes()) {
                Ok(()) => Ok(json!({
                    "content": content_of(&target),
                    "entries": entries(dir.path()),
                })),
                Err(e) => Err(write_kind(&e)),
            };
            if got.is_err() {
                check_entries(section, dir.path(), &before)?;
            }
            Ok(got)
        }
        #[cfg(unix)]
        "write_atomic_mode" => write_atomic_mode(case),
        #[cfg(unix)]
        "write_atomic_symlink" => write_atomic_symlink(case),
        other => panic!("no runner for the section {other}"),
    }
}

#[cfg(unix)]
fn write_atomic_mode(case: &Case) -> Result<Outcome, String> {
    use std::os::unix::fs::PermissionsExt;

    let input: WriteAtomicModeInput = case.input();
    let (_dir, target) = scratch(
        DEFAULT_PATH,
        Some(&Existing::Data(Data::Text("old".into()))),
    );
    let mode = u32::from_str_radix(&input.existing_mode, 8).expect("an octal mode");
    fs::set_permissions(&target, fs::Permissions::from_mode(mode)).expect("chmod");
    Ok(match write_atomic(&target, &input.content.bytes()) {
        Ok(()) => {
            let got = fs::metadata(&target)
                .expect("metadata")
                .permissions()
                .mode()
                & 0o7777;
            Ok(json!({ "mode": format!("{got:o}") }))
        }
        Err(e) => Err(write_kind(&e)),
    })
}

#[cfg(unix)]
fn write_atomic_symlink(case: &Case) -> Result<Outcome, String> {
    let input: WriteAtomicSymlinkInput = case.input();
    let (dir, target) = scratch(DEFAULT_PATH, None);
    let real = dir.path().join("real.txt");
    fs::write(&real, input.linked_content.bytes()).expect("the linked file");
    std::os::unix::fs::symlink("real.txt", &target).expect("a symlink");
    Ok(match write_atomic(&target, &input.content.bytes()) {
        Ok(()) => Ok(json!({
            "content": content_of(&target),
            "linkedContent": content_of(&real),
            "isSymlink": fs::symlink_metadata(&target).expect("metadata").is_symlink(),
            "entries": entries(dir.path()),
        })),
        Err(e) => Err(write_kind(&e)),
    })
}

#[test]
fn every_case_in_the_suite_conforms() {
    let suite: Suite = serde_json::from_str(SUITE_JSON).expect("the suite parses");
    assert_eq!(
        (suite.family.as_str(), suite.reference.as_str()),
        ("etag-write", "ts")
    );
    assert_eq!(
        suite
            .sections
            .keys()
            .map(String::as_str)
            .collect::<Vec<_>>(),
        {
            let mut sections = SECTIONS.to_vec();
            sections.sort_unstable();
            sections
        },
        "the suite's sections are not the ones this test runs"
    );

    let mut failures = Vec::new();
    for (name, section) in &suite.sections {
        let mut ran = 0;
        for case in &section.cases {
            // Every case's shape and input are checked on every host, before
            // `platforms` and `skip` filter it.
            check_input(name, case);
            let want = case.want();
            assert!(
                case.skip.values().all(|reason| !reason.is_empty()),
                "{name}: {}: a skip needs a reason",
                case.name
            );
            if !case.for_this_host() || case.skip.contains_key("rust") {
                continue;
            }
            ran += 1;
            match run(name, case) {
                Ok(got) if got == want => {}
                Ok(got) => failures.push(format!(
                    "{name}: {}: expected {want:?}, got {got:?}",
                    case.name
                )),
                Err(msg) => failures.push(format!("{name}: {}: {msg}", case.name)),
            }
        }
        // A section none of whose cases run here would pass unseen, unless
        // every case's `platforms` excludes this host.
        if section.cases.iter().any(Case::for_this_host) {
            assert!(ran > 0, "{name}: no case of this section runs on this host");
        }
    }
    assert!(
        failures.is_empty(),
        "{} failed:\n{}",
        failures.len(),
        failures.join("\n")
    );
}
