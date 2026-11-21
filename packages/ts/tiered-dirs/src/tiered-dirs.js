import { join } from 'node:path';
import { systemBaseDirs } from './base-dirs.ts';
import { assertSegment } from './segment.ts';
/**
 * Every {@link TierKind}.
 *
 * Stable in 0.x.
 */
export const TIER_KINDS = ['vendor', 'suite', 'standalone'];
/**
 * Whether a bundle identifier starts with `vendor`: a bare prefix test. The
 * Rust crate's `is_vendor_bundle_id` is the same test. It is not stricter on
 * purpose. A dot-boundary rule would make the two packages disagree about
 * which apps conform.
 *
 * For a caller with no {@link TieredDirs}. The Rust crate also has a
 * debug-only assert form. TypeScript has no debug build, so the caller
 * decides what to do with the result.
 *
 * Stable in 0.x.
 */
export function isVendorBundleId(vendor, bundleId) {
    return bundleId.startsWith(vendor);
}
/**
 * A directory addressed by tier and home, or the scratch root, plus any scope
 * and app segments below it. Immutable: every builder method returns
 * a new value.
 *
 * Exported from the package as a type only. Get one from `Tier.home`,
 * `TieredDirs.scratch()`, `Dir.scoped` or `Dir.app`, which check their input.
 *
 * Stable in 0.x.
 */
export class Dir {
    /** The resolved root this path is under: a home's base, or scratch. */
    base;
    /** Validated segments below {@link base}, outermost first. */
    get segments() {
        return this.#segments;
    }
    // A private field makes the type nominal: an object literal is not a `Dir`.
    #segments;
    constructor(base, segments) {
        this.base = base;
        this.#segments = Object.freeze([...segments]);
    }
    /** The absolute directory, joined with the host's separator. */
    get path() {
        return this.segments.length === 0 ? this.base : join(this.base, ...this.segments);
    }
    /**
     * The segments below the base, always `/`-separated.
     *
     * The conformance suite checks this value. The Rust crate and this package must
     * produce the same string here for the same input.
     */
    get relative() {
        return this.segments.join('/');
    }
    /**
     * Key this location by a content root's id:
     * `.scoped('vaults', vaultId)` appends `vaults/<vaultId>`.
     *
     * Both arguments are validated as single path segments.
     */
    scoped(kind, key) {
        assertSegment('scope kind', kind);
        assertSegment('scope', key);
        return new Dir(this.base, [...this.segments, kind, key]);
    }
    /** Append one app's own directory. Validated as a single path segment. */
    app(app) {
        assertSegment('app', app);
        return new Dir(this.base, [...this.segments, app]);
    }
    toString() {
        return this.path;
    }
}
/**
 * One tier (who shares the state), bound to a set of base directories. Call a
 * home method on it to get a directory.
 *
 * Tiers are distinct addresses. `vendor().durable()`, `suite(k).durable()` and
 * `standalone(t).durable()` are different locations, and this package never
 * reads two and merges them. A given piece of state lives at exactly one tier
 * and the caller names the tier it means. A reader that wants to look in two
 * tiers does so on purpose, per file, in its own code. A per-key fallback
 * built in here would grow into deep-merge rules nobody can predict.
 *
 * Exported from the package as a type only. Get one from `TieredDirs.vendor()`,
 * `suite(key)` or `standalone(tool)`, which check their input.
 *
 * Stable in 0.x.
 */
export class Tier {
    /** The directory segment this tier contributes, e.g. `com.example.notes`. */
    segment;
    /** Which method produced this tier (`vendor`, `suite` or `standalone`). */
    kind;
    #bases;
    constructor(bases, kind, segment) {
        this.#bases = bases;
        this.kind = kind;
        this.segment = segment;
    }
    /** Long-lived state that must survive a cache purge. */
    durable() {
        return this.home('durable');
    }
    /** User-editable configuration. */
    config() {
        return this.home('config');
    }
    /** Regenerable data. The OS may delete this at any time. */
    cache() {
        return this.home('cache');
    }
    /** State that should outlive a restart but is not user data. */
    state() {
        return this.home('state');
    }
    /** Log files. Never under `cache`, because the OS purges cache. */
    logs() {
        return this.home('logs');
    }
    /** Pidfiles, sockets, locks. Never under `cache`. */
    runtime() {
        return this.home('runtime');
    }
    /** The same six homes, named dynamically. Table-driven callers use this. */
    home(home) {
        return new Dir(this.#bases[home], [this.segment]);
    }
}
/**
 * The entry point: a vendor and base directories resolved once, and the tiers
 * built from them.
 *
 * ```ts
 * const dirs = TieredDirs.fromEnv('com.example', envVars('EXAMPLE'))
 * dirs.suite('notes').cache().scoped('vaults', vaultId).app('search').path
 * // <cache>/com.example.notes/vaults/<vaultId>/search
 * ```
 *
 * The product tier (one product's own directory, keyed by bundle id) is not
 * here. An app framework usually resolves it, and this package takes no
 * framework dependency.
 *
 * Stable in 0.x.
 */
export class TieredDirs {
    /** The vendor segment: the vendor tier, and the prefix of every suite. */
    vendorName;
    /** The roots every path in this instance is under. Resolved at construction. */
    bases;
    /**
     * Build from injected roots. A server that cannot read the environment uses
     * this to pass roots from its own config.
     *
     * Throws {@link TieredDirsError} with code `INVALID_KEY` unless `vendor` is
     * a single path segment.
     */
    constructor(vendor, bases) {
        assertSegment('vendor', vendor);
        this.vendorName = vendor;
        this.bases = Object.freeze({ ...bases });
    }
    /**
     * Build from the environment, reading it exactly once through
     * {@link systemBaseDirs}. Every input is injectable, so a test asserts exact
     * paths without a real home directory. `opts.convention` picks the per-OS
     * table: `native` (the default) or `xdg`.
     *
     * Throws {@link TieredDirsError} as {@link systemBaseDirs} does, and with
     * code `INVALID_KEY` unless `vendor` is a single path segment.
     */
    static fromEnv(vendor, vars, opts = {}) {
        return new TieredDirs(vendor, systemBaseDirs(vars, opts));
    }
    /** Shared by every product line the vendor ships: `<vendor>`. */
    vendor() {
        return new Tier(this.bases, 'vendor', this.vendorName);
    }
    /**
     * Shared by the products that share user data: `<vendor>.<suiteKey>`.
     *
     * `suiteKey` is a caller-supplied constant, not something derived from a
     * bundle id.
     */
    suite(suiteKey) {
        assertSegment('suite', suiteKey);
        return new Tier(this.bases, 'suite', `${this.vendorName}.${suiteKey}`);
    }
    /**
     * One general tool's own root: the bare `tool` name, with no vendor segment.
     *
     * For a tool the vendor ships into other people's repositories. It is not
     * part of the vendor's suite, so it must not write under the vendor's
     * namespace. Its config directory is `~/.config/<tool>` on Linux and under
     * `xdg` on macOS, and `~/Library/Application Support/<tool>` under `native`
     * on macOS.
     *
     * Use {@link TieredDirs.suite} for anything that ships as part of the suite.
     * The two are different addresses and nothing merges them.
     */
    standalone(tool) {
        assertSegment('standalone', tool);
        return new Tier(this.bases, 'standalone', tool);
    }
    /**
     * Whether a bundle identifier sits under this vendor.
     *
     * {@link isVendorBundleId} with this vendor. It reports and does not
     * enforce. TS has no debug assertion, so the caller decides what to do with
     * the result.
     */
    isVendorBundleId(bundleId) {
        return isVendorBundleId(this.vendorName, bundleId);
    }
    /**
     * The platform temp directory, with no tier: state that does not outlive the
     * call that wrote it.
     *
     * A thin wrapper over the platform temp dir. It adds nothing on purpose. With
     * it, "no direct OS path call outside this package" can be checked with a
     * search, with no exceptions.
     *
     * Not {@link Tier.runtime}. Runtime holds state that outlives the call and
     * describes a live process: a pidfile, a socket, a lock. The OS may clear
     * temp while such a process is still running.
     */
    scratch() {
        return new Dir(this.bases.scratch, []);
    }
}
