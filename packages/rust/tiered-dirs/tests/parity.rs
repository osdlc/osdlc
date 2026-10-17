//! The shared parity fixture, driven from this side.
//!
//! `tests/fixtures/parity.json` is the contract between this crate and its
//! TypeScript twin, which carries a byte-identical copy and a test that fails
//! when the copies differ: same input, same `relative`, byte for byte. Base
//! directories are stubbed so the comparison is about path shape; `env_cases`
//! pin the absolute base directories the override variables resolve to, and
//! `convention_cases` pin the XDG layout under one home. The TS
//! twin's `tests/parity.test.ts` drives the same file with the same
//! assertions; a case added on either side goes in the fixture, never in one
//! twin's own suite.
//!
//! An integration test, not a unit one, so it reaches the fixture only through
//! the public API — whatever a consumer can express, this pins.

use std::collections::{BTreeMap, BTreeSet};
use std::path::{Path, PathBuf};

use serde::Deserialize;
use tiered_dirs::{
    BaseDirs, Convention, Dir, EnvVars, Error, Home, ResolveOptions, Tier, TierKind, TieredDirs,
};

type Env = BTreeMap<String, String>;

/// Compiled in rather than read at runtime: the test binary then carries the
/// fixture, and a moved or deleted fixture is a build error, not a late panic.
const FIXTURE_JSON: &str = include_str!("fixtures/parity.json");

/// The fixture's `env_prefix`, as the names `env_vars!` derives from it.
const ENV: EnvVars = tiered_dirs::env_vars!("EXAMPLE");

/// Every top-level key, so a misspelled or stray one fails here.
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Fixture {
    #[serde(rename = "_comment")]
    _comment: Vec<String>,
    vendor: String,
    env_prefix: String,
    cases: Vec<Case>,
    scratch_cases: Vec<ScratchCase>,
    env_cases: Vec<EnvCase>,
    convention_cases: Vec<ConventionCase>,
    rejected: Vec<Rejected>,
    rejected_conventions: Vec<Rejected>,
}

/// Base directories resolved from the environment. `expected` maps a home
/// name (or `scratch`) to an absolute path; an omitted one is the same
/// resolution under the default convention with no override variable set.
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct EnvCase {
    name: String,
    /// The constructor's convention. Omitted means the default.
    #[serde(default)]
    convention: Option<String>,
    env: Env,
    expected: Env,
    /// `expected` holds XDG paths, which a Windows host does not use.
    #[serde(default)]
    windows_native: bool,
}

/// The XDG layout under `home`, from `XDG_*` variables only. `expected` pins
/// every home.
#[derive(Deserialize)]
struct ConventionCase {
    name: String,
    home: String,
    env: Env,
    expected: Env,
}

#[derive(Deserialize)]
struct Case {
    name: String,
    tier: String,
    key: Option<String>,
    home: String,
    scope_kind: Option<String>,
    scope_key: Option<String>,
    app: Option<String>,
    relative: String,
}

/// `TieredDirs::scratch` is untiered and has no home, so its cases carry neither.
#[derive(Deserialize)]
struct ScratchCase {
    name: String,
    scope_kind: Option<String>,
    scope_key: Option<String>,
    app: Option<String>,
    relative: String,
}

#[derive(Deserialize)]
struct Rejected {
    name: String,
    value: String,
}

/// The four shapes a case can take, derived from which fields are set.
fn shape_of(scope_kind: &Option<String>, app: &Option<String>) -> &'static str {
    match (scope_kind.is_some(), app.is_some()) {
        (false, false) => "plain",
        (false, true) => "app",
        (true, false) => "scope",
        (true, true) => "scope+app",
    }
}

impl Case {
    fn shape(&self) -> &'static str {
        shape_of(&self.scope_kind, &self.app)
    }
}

impl ScratchCase {
    fn shape(&self) -> &'static str {
        shape_of(&self.scope_kind, &self.app)
    }
}

const SHAPES: [&str; 4] = ["plain", "app", "scope", "scope+app"];

fn fixture() -> Fixture {
    serde_json::from_str(FIXTURE_JSON).expect("parity fixture is valid JSON")
}

/// The TS twin stubs with `rootedBaseDirs('/stub')`. Same layout here.
fn dirs() -> TieredDirs {
    TieredDirs::with_base_dirs(&fixture().vendor, BaseDirs::rooted("/stub"))
        .expect("the fixture's vendor is a valid segment")
}

fn home_of(name: &str) -> Home {
    Home::ALL
        .into_iter()
        .find(|home| home.as_str() == name)
        .unwrap_or_else(|| panic!("fixture names a home this twin lacks: {name:?}"))
}

fn tier_of<'a>(dirs: &'a TieredDirs, case: &Case) -> Result<Tier<'a>, Error> {
    let key = || {
        case.key
            .as_deref()
            .unwrap_or_else(|| panic!("{}: tier {:?} needs a key", case.name, case.tier))
    };
    match case.tier.as_str() {
        "vendor" => Ok(dirs.vendor()),
        "suite" => dirs.suite(key()),
        "standalone" => dirs.standalone(key()),
        other => panic!("fixture names a tier this twin lacks: {other:?}"),
    }
}

/// Narrow a directory by whichever of scope and app the case sets.
fn narrow(
    mut dir: Dir,
    scope_kind: &Option<String>,
    scope_key: &Option<String>,
    app: &Option<String>,
) -> Result<PathBuf, Error> {
    if let (Some(kind), Some(key)) = (scope_kind, scope_key) {
        dir = dir.scoped(kind, key)?;
    }
    if let Some(app) = app {
        dir = dir.app(app)?;
    }
    Ok(dir.into_path())
}

fn resolve(dirs: &TieredDirs, case: &Case) -> Result<PathBuf, Error> {
    let dir = tier_of(dirs, case)?.home(home_of(&case.home));
    narrow(dir, &case.scope_kind, &case.scope_key, &case.app)
}

/// `<base>/<relative>`, with `relative` split on `/` so the join is the host's
/// separator rather than the fixture's. An empty `relative` is the base itself
/// — the shape `TieredDirs::scratch()` takes before it is narrowed.
fn expected_path(base: &Path, relative: &str) -> PathBuf {
    let mut path = base.to_path_buf();
    if relative.is_empty() {
        return path;
    }
    for segment in relative.split('/') {
        path.push(segment);
    }
    path
}

/// What the fixture pins: the segments below the home's base directory, always
/// `/`-separated. The TS twin reads this straight off `Dir.relative`;
/// here it comes off the resolved path, since `Dir` holds only the join.
fn relative_of(base: &Path, resolved: &Path) -> String {
    resolved
        .strip_prefix(base)
        .unwrap_or_else(|_| panic!("{resolved:?} does not sit under its base {base:?}"))
        .components()
        .map(|component| component.as_os_str().to_string_lossy().into_owned())
        .collect::<Vec<_>>()
        .join("/")
}

#[test]
fn fixture_env_prefix_matches_the_names_this_suite_reads() {
    assert_eq!(format!("{}_ROOT", fixture().env_prefix), ENV.root);
}

#[test]
fn every_case_resolves_to_its_fixture_path() {
    let fixture = fixture();
    let dirs = dirs();
    for case in &fixture.cases {
        let base = dirs.base_dirs().get(home_of(&case.home));
        let got = resolve(&dirs, case).unwrap_or_else(|err| panic!("{}: {err}", case.name));
        assert_eq!(relative_of(base, &got), case.relative, "{}", case.name);
        assert_eq!(got, expected_path(base, &case.relative), "{}", case.name);
    }
}

#[test]
fn every_scratch_case_resolves_to_its_fixture_path() {
    let fixture = fixture();
    let dirs = dirs();
    let base = dirs.base_dirs().scratch();
    for case in &fixture.scratch_cases {
        let got = narrow(dirs.scratch(), &case.scope_kind, &case.scope_key, &case.app)
            .unwrap_or_else(|err| panic!("{}: {err}", case.name));
        assert_eq!(relative_of(base, &got), case.relative, "{}", case.name);
        assert_eq!(got, expected_path(base, &case.relative), "{}", case.name);
    }
}

/// The architectural invariant, not just a shape: a standalone tool installed
/// in a third party's repository must not write under the vendor's namespace,
/// and scratch belongs to no vendor at all.
#[test]
fn nothing_outside_the_suite_carries_the_vendor_segment() {
    let fixture = fixture();
    let vendor = fixture.vendor.as_str();
    for case in fixture.cases.iter().filter(|c| c.tier == "standalone") {
        assert!(
            !case.relative.contains(vendor),
            "{}: standalone relative {:?} carries {vendor}",
            case.name,
            case.relative
        );
    }
    for case in &fixture.scratch_cases {
        assert!(
            !case.relative.contains(vendor),
            "{}: scratch relative {:?} carries {vendor}",
            case.name,
            case.relative
        );
    }

    let dirs = dirs();
    assert!(
        !dirs
            .standalone("devtool")
            .unwrap()
            .segment()
            .contains(vendor)
    );
}

// Coverage, so a new axis value with no case fails here rather than going
// untested. The TS twin asserts the same products over the same file.
#[test]
fn every_tier_by_home_pair_has_a_case() {
    let fixture = fixture();
    let covered: BTreeSet<String> = fixture
        .cases
        .iter()
        .map(|case| format!("{}/{}", case.tier, case.home))
        .collect();
    for tier in TierKind::ALL {
        for home in Home::ALL {
            let pair = format!("{}/{}", tier.as_str(), home.as_str());
            assert!(covered.contains(&pair), "no parity case for {pair}");
        }
    }
}

#[test]
fn every_tier_by_shape_pair_has_a_case() {
    let fixture = fixture();
    let covered: BTreeSet<String> = fixture
        .cases
        .iter()
        .map(|case| format!("{}/{}", case.tier, case.shape()))
        .collect();
    for tier in TierKind::ALL {
        for shape in SHAPES {
            let pair = format!("{}/{shape}", tier.as_str());
            assert!(covered.contains(&pair), "no parity case for {pair}");
        }
    }
}

/// Scratch has no tier and no home, so shape is the only axis left to cover.
#[test]
fn every_scratch_shape_has_a_case() {
    let fixture = fixture();
    let covered: BTreeSet<&str> = fixture
        .scratch_cases
        .iter()
        .map(ScratchCase::shape)
        .collect();
    for shape in SHAPES {
        assert!(
            covered.contains(shape),
            "no scratch parity case for {shape}"
        );
    }
}

/// The fixture's absolute paths are POSIX (`/fr`). On Windows a path needs a
/// drive to be absolute, so this suite puts one in front, on the variables
/// and on the expected paths alike.
fn host_abs(path: &str) -> PathBuf {
    if cfg!(windows) && path.starts_with('/') {
        PathBuf::from(format!("C:{path}"))
    } else {
        PathBuf::from(path)
    }
}

/// A fixture variable as the host reads it: [`host_abs`] for a value that
/// starts with `/`, anything else unchanged.
fn host_var(env: &Env, name: &str) -> Option<std::ffi::OsString> {
    env.get(name).map(|value| host_abs(value).into_os_string())
}

fn from_vars(opts: ResolveOptions, env: &Env) -> BaseDirs {
    BaseDirs::from_env_opts_with(&ENV, opts, |name| host_var(env, name))
        .unwrap_or_else(|err| panic!("{env:?}: {err}"))
}

/// A base directory by its fixture name: a home, or `scratch`.
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

#[test]
fn every_env_case_resolves_to_its_fixture_paths() {
    // A machine with no home directory has no OS default to compare with.
    if BaseDirs::from_env_with(&ENV, |_| None).is_err() {
        return;
    }
    for case in fixture().env_cases {
        let windows_native = cfg!(windows) && case.windows_native;
        // The default convention with no override variable set. On Windows a
        // `windows_native` row also drops the convention and `XDG_*`, so the
        // row proves Xdg is Native there and `XDG_*` is ignored.
        let unmoved: Env = case
            .env
            .iter()
            .filter(|(name, _)| !ENV.overrides().any(|var| var == name.as_str()))
            .filter(|(name, _)| {
                !windows_native || (name.as_str() != ENV.convention && !name.starts_with("XDG_"))
            })
            .map(|(name, value)| (name.clone(), value.clone()))
            .collect();
        let os = from_vars(ResolveOptions::new(), &unmoved);
        let convention = match case.convention.as_deref() {
            None => Convention::default(),
            Some(name) => name
                .parse()
                .unwrap_or_else(|err| panic!("{}: {err}", case.name)),
        };
        let base = from_vars(ResolveOptions::new().with_convention(convention), &case.env);
        for name in base_names() {
            let want = match case.expected.get(name) {
                Some(path) if !windows_native => host_abs(path),
                _ => base_of(&os, name).to_path_buf(),
            };
            assert_eq!(base_of(&base, name), want, "{}: {name}", case.name);
        }
    }
}

#[test]
fn every_override_var_has_an_env_case() {
    let covered: BTreeSet<String> = fixture()
        .env_cases
        .iter()
        .flat_map(|case| case.env.keys().cloned())
        .collect();
    for var in ENV.overrides().chain([ENV.convention]) {
        assert!(covered.contains(var), "no env case sets {var}");
    }
}

#[test]
fn every_convention_case_resolves_to_its_fixture_paths() {
    for case in fixture().convention_cases {
        let base = BaseDirs::xdg(host_abs(&case.home), |name| host_var(&case.env, name));
        for home in Home::ALL {
            let want = case
                .expected
                .get(home.as_str())
                .unwrap_or_else(|| panic!("{}: no {}", case.name, home.as_str()));
            assert_eq!(
                base.get(home),
                host_abs(want),
                "{}: {}",
                case.name,
                home.as_str()
            );
        }
    }
}

#[test]
fn every_rejected_convention_is_refused() {
    for Rejected { name, value } in fixture().rejected_conventions {
        let err = BaseDirs::from_env_with(&ENV, |var| {
            (var == ENV.convention).then(|| value.clone().into())
        })
        .unwrap_err();
        assert!(
            err.to_string().contains(&format!("{value:?}")),
            "{name}: {err}"
        );
        assert_eq!(
            err,
            Error::InvalidConvention {
                var: ENV.convention,
                value,
            },
            "{name}"
        );
    }
}

#[test]
fn every_rejected_segment_is_rejected_in_every_position() {
    let fixture = fixture();
    let dirs = dirs();
    let cache = dirs.suite("notes").unwrap().cache();
    for Rejected { name, value } in &fixture.rejected {
        assert!(dirs.suite(value).is_err(), "suite: {name}");
        assert!(dirs.standalone(value).is_err(), "standalone: {name}");
        assert!(cache.app(value).is_err(), "app: {name}");
        assert!(cache.scoped(value, "v7").is_err(), "scope kind: {name}");
        assert!(cache.scoped("vaults", value).is_err(), "scope key: {name}");
    }
}
