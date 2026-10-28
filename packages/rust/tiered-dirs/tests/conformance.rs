//! Runs the tiered-dirs conformance suite, `packages/conformance/tiered-dirs/suite.json`.
//!
//! The suite holds the cases this crate and the TypeScript `@osdlc/tiered-dirs`
//! package must agree on. The TypeScript package is the family's reference:
//! its generator writes every `expect` and `error`. Every section and every
//! case runs here, and a section this test does not know fails it. The other
//! tests add what the suite's values cannot say on their own: the joined path,
//! and that every axis of the API has a case.
//!
//! An integration test, not a unit test, so it uses only the public API. It
//! checks what a consumer can express.

use std::collections::{BTreeMap, BTreeSet};
use std::path::{Path, PathBuf};

use serde::Deserialize;
use serde::de::DeserializeOwned;
use serde_json::Value;
use tiered_dirs::{
    BaseDirs, Convention, Dir, EnvVars, Error, Home, ResolveOptions, TierKind, TieredDirs,
};

type Env = BTreeMap<String, String>;

/// Compiled in rather than read at runtime: the test binary then carries the
/// suite, and a moved or deleted suite is a build error, not a late panic.
const SUITE_JSON: &str = include_str!("../../../conformance/tiered-dirs/suite.json");

/// The suite's `env_prefix`, as the names `env_vars!` derives from it. The
/// macro needs a literal, so a case with another prefix fails.
const ENV: EnvVars = tiered_dirs::env_vars!("EXAMPLE");

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

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct ErrorKind {
    kind: String,
}

impl Case {
    fn runs_here(&self) -> bool {
        if self.skip.contains_key("rust") {
            return false;
        }
        let host = if cfg!(windows) { "windows" } else { "unix" };
        self.platforms
            .as_ref()
            .is_none_or(|platforms| platforms.iter().any(|p| p == host))
    }

    fn input<T: DeserializeOwned>(&self) -> T {
        serde_json::from_value(self.input.clone())
            .unwrap_or_else(|err| panic!("{}: input: {err}", self.name))
    }

    fn expect<T: DeserializeOwned>(&self) -> T {
        let expect = self
            .expect
            .clone()
            .unwrap_or_else(|| panic!("{}: no expect", self.name));
        serde_json::from_value(expect).unwrap_or_else(|err| panic!("{}: expect: {err}", self.name))
    }

    fn error_kind(&self) -> &str {
        &self
            .error
            .as_ref()
            .unwrap_or_else(|| panic!("{}: no error", self.name))
            .kind
    }
}

/// The scope and app a case narrows a directory by. `serde(flatten)` does not
/// combine with `deny_unknown_fields`, so each input carries the three fields
/// and lends them here.
struct Narrowing<'a> {
    scope_kind: &'a Option<String>,
    scope_key: &'a Option<String>,
    app: &'a Option<String>,
}

impl ResolveInput {
    fn narrowing(&self) -> Narrowing<'_> {
        Narrowing {
            scope_kind: &self.scope_kind,
            scope_key: &self.scope_key,
            app: &self.app,
        }
    }
}

impl ScratchInput {
    fn narrowing(&self) -> Narrowing<'_> {
        Narrowing {
            scope_kind: &self.scope_kind,
            scope_key: &self.scope_key,
            app: &self.app,
        }
    }
}

impl Narrowing<'_> {
    /// The four shapes a case can take, derived from which fields are set.
    fn shape(&self) -> &'static str {
        match (self.scope_kind.is_some(), self.app.is_some()) {
            (false, false) => "plain",
            (false, true) => "app",
            (true, false) => "scope",
            (true, true) => "scope+app",
        }
    }

    fn apply(&self, mut dir: Dir) -> Result<PathBuf, Error> {
        if let (Some(kind), Some(key)) = (self.scope_kind, self.scope_key) {
            dir = dir.scoped(kind, key)?;
        }
        if let Some(app) = self.app {
            dir = dir.app(app)?;
        }
        Ok(dir.into_path())
    }
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct ResolveInput {
    vendor: String,
    tier: String,
    key: Option<String>,
    home: String,
    scope_kind: Option<String>,
    scope_key: Option<String>,
    app: Option<String>,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct ScratchInput {
    vendor: String,
    scope_kind: Option<String>,
    scope_key: Option<String>,
    app: Option<String>,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Relative {
    relative: String,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct EnvInput {
    env_prefix: String,
    #[serde(default)]
    convention: Option<String>,
    env: Env,
    #[serde(default)]
    windows_native: bool,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct ConventionInput {
    home: String,
    env: Env,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Bases {
    bases: Env,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct SegmentInput {
    value: String,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct ConventionValueInput {
    env_prefix: String,
    value: String,
}

const SHAPES: [&str; 4] = ["plain", "app", "scope", "scope+app"];

fn suite() -> Suite {
    serde_json::from_str(SUITE_JSON).expect("the suite is valid JSON in the suite format")
}

/// The cases of one section.
fn cases(section: &str) -> Vec<Case> {
    suite()
        .sections
        .remove(section)
        .unwrap_or_else(|| panic!("the suite has no {section} section"))
        .cases
}

/// The TypeScript package stubs with `rootedBaseDirs('/stub')`. Same layout here.
fn stub_bases() -> BaseDirs {
    BaseDirs::rooted("/stub")
}

fn dirs(vendor: &str) -> TieredDirs {
    TieredDirs::with_base_dirs(vendor, stub_bases()).expect("the suite's vendor is a valid segment")
}

fn home_of(name: &str) -> Home {
    Home::ALL
        .into_iter()
        .find(|home| home.as_str() == name)
        .unwrap_or_else(|| panic!("the suite names a home this crate lacks: {name:?}"))
}

fn resolve(input: &ResolveInput) -> Result<PathBuf, Error> {
    let dirs = dirs(&input.vendor);
    let key = || {
        input
            .key
            .as_deref()
            .unwrap_or_else(|| panic!("tier {:?} needs a key", input.tier))
    };
    let tier = match input.tier.as_str() {
        "vendor" => dirs.vendor(),
        "suite" => dirs.suite(key())?,
        "standalone" => dirs.standalone(key())?,
        other => panic!("the suite names a tier this crate lacks: {other:?}"),
    };
    input.narrowing().apply(tier.home(home_of(&input.home)))
}

/// `<base>/<relative>`, with `relative` split on `/` so the join is the host's
/// separator rather than the suite's. An empty `relative` is the base itself.
fn expected_path(base: &Path, relative: &str) -> PathBuf {
    let mut path = base.to_path_buf();
    if !relative.is_empty() {
        path.extend(relative.split('/'));
    }
    path
}

/// The segments below the base directory, always `/`-separated. The
/// TypeScript package reads this from `Dir.relative`. Here it comes from the
/// resolved path, since `Dir` holds only the joined path.
fn relative_of(base: &Path, resolved: &Path) -> String {
    resolved
        .strip_prefix(base)
        .unwrap_or_else(|_| panic!("{resolved:?} does not sit under its base {base:?}"))
        .components()
        .map(|component| component.as_os_str().to_string_lossy().into_owned())
        .collect::<Vec<_>>()
        .join("/")
}

/// The suite's absolute paths are POSIX (`/fr`). On Windows a path needs a
/// drive to be absolute, so this test puts one in front, on the variables and
/// on the expected paths alike.
fn host_abs(path: &str) -> PathBuf {
    if cfg!(windows) && path.starts_with('/') {
        PathBuf::from(format!("C:{path}"))
    } else {
        PathBuf::from(path)
    }
}

fn from_vars(opts: ResolveOptions, env: &Env) -> BaseDirs {
    BaseDirs::from_env_with(&ENV, opts, |name| {
        env.get(name).map(|value| host_abs(value).into_os_string())
    })
    .unwrap_or_else(|err| panic!("{env:?}: {err}"))
}

/// A base directory by its suite name: a home, or `scratch`.
fn base_of<'a>(base: &'a BaseDirs, name: &str) -> &'a Path {
    if name == "scratch" {
        base.scratch()
    } else {
        base.get(home_of(name))
    }
}

fn base_names() -> impl Iterator<Item = &'static str> {
    Home::ALL.into_iter().map(Home::as_str).chain(["scratch"])
}

/// The `kind` the suite spells for this crate's error.
fn kind_of(err: &Error) -> &'static str {
    match err {
        Error::MissingBaseDir { .. } => "missing_base_dir",
        Error::RelativeOverride { .. } => "relative_override",
        Error::OverrideRequired { .. } => "override_required",
        Error::InvalidConvention { .. } => "invalid_convention",
        Error::InvalidKey { .. } => "invalid_key",
        other => panic!("an error the suite has no kind for: {other}"),
    }
}

fn run_resolve(case: &Case) {
    let input: ResolveInput = case.input();
    let want: Relative = case.expect();
    let base = stub_bases();
    let base = base.get(home_of(&input.home));
    let got = resolve(&input).unwrap_or_else(|err| panic!("{}: {err}", case.name));
    assert_eq!(relative_of(base, &got), want.relative, "{}", case.name);
    assert_eq!(got, expected_path(base, &want.relative), "{}", case.name);
}

fn run_scratch(case: &Case) {
    let input: ScratchInput = case.input();
    let want: Relative = case.expect();
    let dirs = dirs(&input.vendor);
    let base = dirs.base_dirs().scratch();
    let got = input
        .narrowing()
        .apply(dirs.scratch())
        .unwrap_or_else(|err| panic!("{}: {err}", case.name));
    assert_eq!(relative_of(base, &got), want.relative, "{}", case.name);
    assert_eq!(got, expected_path(base, &want.relative), "{}", case.name);
}

/// `bases` lists what moved from a bare system's: the native convention with
/// no override variable, no convention variable and no `XDG_*` set. Windows
/// ignores the convention and `XDG_*`, so there a `windows_native` case
/// resolves as a bare system does.
fn run_env(case: &Case) {
    // A machine with no home directory has no bare system to compare with.
    if BaseDirs::from_env_with(&ENV, ResolveOptions::new(), |_| None).is_err() {
        return;
    }
    let input: EnvInput = case.input();
    let want: Bases = case.expect();
    assert_eq!(input.env_prefix, "EXAMPLE", "{}", case.name);
    let bare: Env = input
        .env
        .iter()
        .filter(|(name, _)| !ENV.overrides().any(|var| var == name.as_str()))
        .filter(|(name, _)| name.as_str() != ENV.convention && !name.starts_with("XDG_"))
        .map(|(name, value)| (name.clone(), value.clone()))
        .collect();
    let os = from_vars(ResolveOptions::new(), &bare);
    let convention = match input.convention.as_deref() {
        None => Convention::default(),
        Some(name) => name
            .parse()
            .unwrap_or_else(|err| panic!("{}: {err}", case.name)),
    };
    let base = from_vars(
        ResolveOptions::new().with_convention(convention),
        &input.env,
    );
    let windows_native = cfg!(windows) && input.windows_native;
    for name in base_names() {
        let want = match want.bases.get(name) {
            Some(path) if !windows_native => host_abs(path),
            _ => base_of(&os, name).to_path_buf(),
        };
        assert_eq!(base_of(&base, name), want, "{}: {name}", case.name);
    }
}

fn run_convention(case: &Case) {
    let input: ConventionInput = case.input();
    let want: Bases = case.expect();
    let base = BaseDirs::xdg(host_abs(&input.home), |name| {
        input
            .env
            .get(name)
            .map(|value| host_abs(value).into_os_string())
    });
    assert_eq!(
        want.bases.keys().map(String::as_str).collect::<Vec<_>>(),
        {
            let mut homes: Vec<&str> = Home::ALL.into_iter().map(Home::as_str).collect();
            homes.sort_unstable();
            homes
        },
        "{}: bases names every home",
        case.name
    );
    for home in Home::ALL {
        assert_eq!(
            base.get(home),
            host_abs(&want.bases[home.as_str()]),
            "{}: {}",
            case.name,
            home.as_str()
        );
    }
}

/// Every position that validates a segment refuses it, with the suite's kind.
fn run_rejected_segment(case: &Case) {
    let SegmentInput { value } = case.input();
    let dirs = dirs("com.example");
    let cache = dirs.suite("notes").unwrap().cache();
    let positions: [(&str, Option<Error>); 6] = [
        (
            "vendor",
            TieredDirs::with_base_dirs(&value, stub_bases()).err(),
        ),
        ("suite", dirs.suite(&value).err()),
        ("standalone", dirs.standalone(&value).err()),
        ("app", cache.clone().app(&value).err()),
        ("scope kind", cache.clone().scoped(&value, "v7").err()),
        ("scope key", cache.clone().scoped("vaults", &value).err()),
    ];
    for (position, err) in positions {
        let err = err.unwrap_or_else(|| panic!("{}: {position} accepted it", case.name));
        assert_eq!(
            kind_of(&err),
            case.error_kind(),
            "{}: {position}",
            case.name
        );
    }
}

fn run_rejected_convention(case: &Case) {
    let ConventionValueInput { env_prefix, value } = case.input();
    assert_eq!(env_prefix, "EXAMPLE", "{}", case.name);
    let err = BaseDirs::from_env_with(&ENV, ResolveOptions::new(), |var| {
        (var == ENV.convention).then(|| value.clone().into())
    })
    .unwrap_err();
    assert_eq!(kind_of(&err), case.error_kind(), "{}", case.name);
    let err = value.parse::<Convention>().unwrap_err();
    assert_eq!(kind_of(&err), case.error_kind(), "{}: from_str", case.name);
}

#[test]
fn every_case_in_the_suite_conforms() {
    let suite = suite();
    assert_eq!(suite.family, "tiered-dirs");
    assert_eq!(suite.reference, "ts");
    let mut ran = 0;
    for (section, body) in &suite.sections {
        let run: fn(&Case) = match section.as_str() {
            "resolve" => run_resolve,
            "scratch" => run_scratch,
            "env" => run_env,
            "convention" => run_convention,
            "rejected_segment" => run_rejected_segment,
            "rejected_convention" => run_rejected_convention,
            other => panic!("the suite has a section this crate does not run: {other}"),
        };
        for case in body.cases.iter().filter(|case| case.runs_here()) {
            run(case);
            ran += 1;
        }
    }
    assert!(ran > 0, "no case ran");
}

/// An invariant, not just a shape. A standalone tool installed in a third
/// party's repository must not write under the vendor's directory, and scratch
/// belongs to no vendor at all.
#[test]
fn nothing_outside_the_suite_carries_the_vendor_segment() {
    for case in cases("resolve") {
        let input: ResolveInput = case.input();
        let want: Relative = case.expect();
        if input.tier == "standalone" {
            assert!(!want.relative.contains(&input.vendor), "{}", case.name);
        }
    }
    for case in cases("scratch") {
        let input: ScratchInput = case.input();
        let want: Relative = case.expect();
        assert!(!want.relative.contains(&input.vendor), "{}", case.name);
    }
}

// Coverage, so a new axis value with no case fails here rather than going
// untested. The TypeScript package checks the same combinations.
#[test]
fn every_tier_by_home_and_by_shape_pair_has_a_case() {
    let inputs: Vec<ResolveInput> = cases("resolve").iter().map(Case::input).collect();
    let by_home: BTreeSet<String> = inputs
        .iter()
        .map(|i| format!("{}/{}", i.tier, i.home))
        .collect();
    let by_shape: BTreeSet<String> = inputs
        .iter()
        .map(|i| format!("{}/{}", i.tier, i.narrowing().shape()))
        .collect();
    for tier in TierKind::ALL {
        for home in Home::ALL {
            let pair = format!("{}/{}", tier.as_str(), home.as_str());
            assert!(by_home.contains(&pair), "no resolve case for {pair}");
        }
        for shape in SHAPES {
            let pair = format!("{}/{shape}", tier.as_str());
            assert!(by_shape.contains(&pair), "no resolve case for {pair}");
        }
    }
    let tiers: BTreeSet<&str> = inputs.iter().map(|i| i.tier.as_str()).collect();
    let ours: BTreeSet<&str> = TierKind::ALL.into_iter().map(TierKind::as_str).collect();
    assert_eq!(
        tiers, ours,
        "the suite names exactly the tiers this crate builds"
    );
}

/// Scratch has no tier and no home, so shape is the only axis left to cover.
#[test]
fn every_scratch_shape_has_a_case() {
    let covered: BTreeSet<&str> = cases("scratch")
        .iter()
        .map(|case| case.input::<ScratchInput>().narrowing().shape())
        .collect();
    for shape in SHAPES {
        assert!(covered.contains(shape), "no scratch case for {shape}");
    }
}

#[test]
fn every_override_var_has_an_env_case() {
    let covered: BTreeSet<String> = cases("env")
        .iter()
        .flat_map(|case| case.input::<EnvInput>().env.into_keys())
        .collect();
    for var in ENV.overrides().chain([ENV.convention]) {
        assert!(covered.contains(var), "no env case sets {var}");
    }
}
