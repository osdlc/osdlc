//! Prints every directory one vendor's programs would use on this machine.
//!
//! Run with `cargo run --example layout`. Set `EXAMPLE_ROOT` to an absolute
//! path to see the whole layout move under it, or `EXAMPLE_CONVENTION=xdg` to
//! see the XDG table.

use std::ffi::OsString;

use tiered_dirs::{
    BaseDirs, Convention, Dir, EnvVars, Error, Home, ResolveOptions, Tier, TierKind, TieredDirs,
    env_vars, is_valid_segment, is_vendor_bundle_id, test_root,
};

const VENDOR: &str = "com.example";
const ENV: EnvVars = env_vars!("EXAMPLE");

fn main() -> Result<(), Error> {
    let env = |name: &str| std::env::var_os(name);
    if ENV.is_overridden(env) {
        println!("override variables set:");
        for name in ENV.overrides() {
            if let Some(value) = std::env::var_os(name) {
                println!("  {name} = {}", value.to_string_lossy());
            }
        }
    }
    // Set only when this runs as a cargo test binary, so `None` here.
    println!("test root: {:?}", test_root());

    let dirs = match TieredDirs::from_env(VENDOR, &ENV) {
        Ok(dirs) => dirs,
        // No home directory on this machine: show the layout under a stub root.
        Err(Error::MissingBaseDir { home }) => {
            println!("no {home} directory here; using the rooted layout");
            TieredDirs::with_base_dirs(VENDOR, BaseDirs::rooted(std::env::temp_dir()))?
        }
        Err(other) => return Err(other),
    };

    println!("\nbase directories:");
    for home in Home::ALL {
        let var = ENV.dir(Some(home));
        println!(
            "  {:8} {}  (moved by {var})",
            home.as_str(),
            show(dirs.base_dirs().get(home))
        );
    }
    println!(
        "  {:8} {}  (moved by {})",
        "scratch",
        show(dirs.base_dirs().scratch()),
        ENV.dir(None)
    );

    let tiers: [Tier<'_>; 3] = [
        dirs.vendor(),
        dirs.suite("notes")?,
        dirs.standalone("devtool")?,
    ];
    for tier in &tiers {
        let kind: TierKind = tier.kind();
        println!("\n{} tier, segment {:?}:", kind.as_str(), tier.segment());
        for home in Home::ALL {
            println!("  {:8} {}", home.as_str(), show(tier.home(home).path()));
        }
    }

    // Narrow a directory by a content root and an app.
    let index: Dir = dirs
        .suite("notes")?
        .cache()
        .scoped("vaults", "v7")?
        .app("search")?;
    println!("\nsearch index for vault v7: {}", show(index.path()));
    println!(
        "scratch for one call:       {}",
        show(dirs.scratch().app("export")?.path())
    );

    // Segments are checked before any path is built.
    for key in ["search", "../escape"] {
        println!("is {key:?} a valid segment? {}", is_valid_segment(key));
    }

    // A layer above this crate can check a program's bundle id.
    let bundle_id = "com.example.notes.desktop";
    println!(
        "{bundle_id} under {}? {}",
        dirs.vendor_name(),
        is_vendor_bundle_id(VENDOR, bundle_id) && dirs.is_vendor_bundle_id(bundle_id),
    );
    tiered_dirs::assert_vendor_bundle_id(VENDOR, bundle_id);
    dirs.assert_vendor_bundle_id(bundle_id);

    // A CLI tool picks the XDG table: `~/.config/devtool` on macOS too.
    let opts = ResolveOptions::new().with_convention("xdg".parse()?);
    let cli = TieredDirs::from_env_opts(VENDOR, &ENV, opts)?;
    println!(
        "\nunder {}: devtool config is {}",
        opts.convention.as_str(),
        show(cli.standalone("devtool")?.config().path())
    );
    let home = std::path::Path::new("/home/me");
    let xdg = BaseDirs::xdg(home, |name| std::env::var_os(name));
    println!("XDG state under /home/me: {}", show(xdg.get(Home::State)));

    // A test resolves from its own map of variables, never the process env.
    let fake = |name: &str| (name == ENV.root).then(|| OsString::from(std::env::temp_dir()));
    let moved = TieredDirs::from_env_with(VENDOR, &ENV, fake)?;
    println!(
        "\nwith EXAMPLE_ROOT = temp: config is {}",
        show(moved.vendor().config().path())
    );

    println!(
        "conventions: {:?}",
        Convention::ALL
            .iter()
            .map(|c| c.as_str())
            .collect::<Vec<_>>()
    );
    let into: std::path::PathBuf = index.into_path();
    println!("as a PathBuf: {}", show(&into));
    Ok(())
}

fn show(path: &std::path::Path) -> std::path::Display<'_> {
    path.display()
}
