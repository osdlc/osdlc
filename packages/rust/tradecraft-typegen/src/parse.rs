//! Reading the Rust source: the wasm exports, and the types they carry.
//!
//! Nothing here decides what TypeScript looks like — that is [`crate::emit`].
//! This module answers three questions from source alone:
//!
//! 1. Which functions does `tradecraft-wasm` export, and by what JS name?
//! 2. For each, what type does it deserialize the request from, and what type
//!    does the core hand back?
//! 3. What do those types, and everything they reach, look like?
//!
//! Question 2 is answered without a registry: an export's request type is the
//! one its own body names in `serde_json::from_str`, and its response type is
//! the return type of the core function its body calls — or, for an export
//! with no core function to call (`knownTargets` hands back a constant), the
//! constant's own type. A new export is covered the day it is written.

use std::collections::BTreeMap;
use std::fs;
use std::path::{Path, PathBuf};

/// A parse or resolution failure, as the sentence the binary prints.
pub type Error = String;

/// One `#[wasm_bindgen]` export and the two types it carries.
#[derive(Debug, Clone)]
pub struct Export {
    /// The name JavaScript calls it by (`js_name`, or the Rust name).
    pub js_name: String,
    /// The Rust type the body deserializes `request_json` into. `None` for an
    /// export that takes no JSON request.
    pub request: Option<String>,
    /// The core's return type, as `(rust type name, is a list)`. `None` for an
    /// export that returns no JSON.
    pub response: Option<(String, bool)>,
}

/// A struct's or enum's `#[serde(...)]` settings, as far as the wire cares.
#[derive(Debug, Clone, Default)]
pub struct SerdeAttrs {
    /// `#[serde(rename = "...")]`: the name on the wire.
    pub rename: Option<String>,
    /// `#[serde(rename_all = "...")]` — a struct's fields, or an enum's
    /// VARIANT names. It does not reach an enum variant's fields; that is
    /// `rename_all_fields`.
    pub rename_all: Option<String>,
    /// `#[serde(rename_all_fields = "...")]` — the fields of every variant of
    /// an enum.
    pub rename_all_fields: Option<String>,
    /// `#[serde(default)]`, on a container or a field.
    pub default: bool,
    /// `#[serde(skip_serializing_if = "...")]` — the field leaves the wire.
    pub skip_serializing_if: bool,
    /// `#[serde(flatten)]` — the field's own fields are spliced in.
    pub flatten: bool,
    /// `#[serde(tag = "...")]` — an internally tagged enum.
    pub tag: Option<String>,
}

/// One named field of a struct or a struct variant.
#[derive(Debug, Clone)]
pub struct Field {
    /// The Rust field name.
    pub name: String,
    /// Its doc comment, one entry per line.
    pub docs: Vec<String>,
    /// Its Rust type.
    pub ty: syn::Type,
    /// Its `#[serde(...)]` settings.
    pub attrs: SerdeAttrs,
}

/// A public struct read from the source.
#[derive(Debug, Clone)]
pub struct Struct {
    /// The Rust type name.
    pub name: String,
    /// Its doc comment, one entry per line.
    pub docs: Vec<String>,
    /// Its `#[serde(...)]` settings.
    pub attrs: SerdeAttrs,
    /// Its named fields, in source order.
    pub fields: Vec<Field>,
    /// Why this type has no wire shape this generator can emit, when it has
    /// none. Refused where the walk reaches it, not where it is read: the core
    /// is full of types that never cross the boundary and never have to.
    pub unsupported: Option<String>,
}

/// One variant of an enum.
#[derive(Debug, Clone)]
pub struct Variant {
    /// The Rust variant name.
    pub name: String,
    /// Its doc comment, one entry per line.
    pub docs: Vec<String>,
    /// Its `#[serde(...)]` settings.
    pub attrs: SerdeAttrs,
    /// `None` for a unit variant; `Some` for a struct variant.
    pub fields: Option<Vec<Field>>,
    /// Set for a tuple variant — see [`Struct::unsupported`].
    pub unsupported: Option<String>,
}

/// A public enum read from the source.
#[derive(Debug, Clone)]
pub struct Enum {
    /// The Rust type name.
    pub name: String,
    /// Its doc comment, one entry per line.
    pub docs: Vec<String>,
    /// Its `#[serde(...)]` settings.
    pub attrs: SerdeAttrs,
    /// Its variants, in source order.
    pub variants: Vec<Variant>,
}

/// A named type the wire can reach.
#[derive(Debug, Clone)]
pub enum TypeDef {
    /// A struct.
    Struct(Struct),
    /// An enum.
    Enum(Enum),
}

impl TypeDef {
    /// The Rust type name.
    pub fn name(&self) -> &str {
        match self {
            Self::Struct(s) => &s.name,
            Self::Enum(e) => &e.name,
        }
    }
}

/// Everything read off disk, resolved.
#[derive(Debug, Default)]
pub struct Model {
    /// Every named type the wire can reach, by its Rust ident.
    pub types: BTreeMap<String, TypeDef>,
    /// The exports, in the order the wrapper declares them.
    pub exports: Vec<Export>,
}

/// Read the wrapper and the core, and resolve the exports against them.
///
/// `extra_files` are read the same way as the files directly under
/// `core_src`: parsed and walked for top-level `pub` structs and enums,
/// which join `types` alongside the core's own. It exists so a type that
/// lives outside `core_src` — `agent-adapt`'s own `diagnostic.rs`,
/// re-exported by the core — is still reachable from here without the core
/// having to define it a second time.
pub fn read(core_src: &Path, wasm_lib: &Path, extra_files: &[PathBuf]) -> Result<Model, Error> {
    let mut types = BTreeMap::new();
    let mut fn_returns: BTreeMap<String, syn::ReturnType> = BTreeMap::new();
    let mut const_types: BTreeMap<String, syn::Type> = BTreeMap::new();

    for path in rust_files(core_src)? {
        let file = parse_file(&path)?;
        collect_items(
            &file.items,
            &mut types,
            &mut fn_returns,
            &mut const_types,
            &path,
        );
    }

    for path in extra_files {
        let file = parse_file(path)?;
        collect_items(
            &file.items,
            &mut types,
            &mut fn_returns,
            &mut const_types,
            path,
        );
    }

    let wasm = parse_file(wasm_lib)?;
    // The wrapper's own wire structs are private, so `collect_items` (which
    // takes pub items only) does not see them. They are the request roots, so
    // read them directly.
    for item in &wasm.items {
        if let syn::Item::Struct(s) = item {
            let def = read_struct(s);
            types.insert(def.name.clone(), TypeDef::Struct(def));
        }
    }

    let aliases = core_item_aliases(&wasm.items, &fn_returns, &const_types);
    let exports = read_exports(&wasm.items, &aliases, &fn_returns, &const_types)?;

    Ok(Model { types, exports })
}

fn parse_file(path: &Path) -> Result<syn::File, Error> {
    let text = fs::read_to_string(path).map_err(|e| format!("reading {}: {e}", path.display()))?;
    syn::parse_file(&text).map_err(|e| format!("parsing {}: {e}", path.display()))
}

/// Every `.rs` file directly under `dir`, sorted, so the read is deterministic.
fn rust_files(dir: &Path) -> Result<Vec<std::path::PathBuf>, Error> {
    let mut paths: Vec<_> = fs::read_dir(dir)
        .map_err(|e| format!("reading {}: {e}", dir.display()))?
        .filter_map(Result::ok)
        .map(|entry| entry.path())
        .filter(|p| p.extension().is_some_and(|e| e == "rs"))
        .collect();
    paths.sort();
    Ok(paths)
}

/// Public structs, enums, functions and constants, indexed by ident.
///
/// A duplicate ident is refused rather than silently shadowed: two core types
/// with one name would make the emitted TypeScript depend on file order.
fn collect_items(
    items: &[syn::Item],
    types: &mut BTreeMap<String, TypeDef>,
    fn_returns: &mut BTreeMap<String, syn::ReturnType>,
    const_types: &mut BTreeMap<String, syn::Type>,
    path: &Path,
) {
    for item in items {
        match item {
            syn::Item::Struct(s) if is_pub(&s.vis) => {
                insert_unique(types, TypeDef::Struct(read_struct(s)), path);
            }
            syn::Item::Enum(e) if is_pub(&e.vis) => {
                insert_unique(types, TypeDef::Enum(read_enum(e)), path);
            }
            syn::Item::Fn(f) if is_pub(&f.vis) => {
                fn_returns.insert(f.sig.ident.to_string(), f.sig.output.clone());
            }
            syn::Item::Const(c) if is_pub(&c.vis) => {
                const_types.insert(c.ident.to_string(), (*c.ty).clone());
            }
            syn::Item::Mod(m) => {
                if let Some((_, inner)) = &m.content {
                    collect_items(inner, types, fn_returns, const_types, path);
                }
            }
            _ => {}
        }
    }
}

/// First declaration wins, and a second one marks the name unsupported.
///
/// Refused where the walk reaches it rather than here: the core holds plenty
/// of names that repeat across private modules and never cross the boundary.
fn insert_unique(types: &mut BTreeMap<String, TypeDef>, def: TypeDef, path: &Path) {
    if types.contains_key(def.name()) {
        let clash = format!(
            "two public types are named `{}` (one of them in {}). Which one the \
             TypeScript describes would depend on which file was read first.",
            def.name(),
            path.display()
        );
        if let Some(TypeDef::Struct(s)) = types.get_mut(def.name()) {
            s.unsupported = Some(clash);
        }
        return;
    }
    types.insert(def.name().to_string(), def);
}

fn is_pub(vis: &syn::Visibility) -> bool {
    matches!(vis, syn::Visibility::Public(_))
}

fn read_struct(item: &syn::ItemStruct) -> Struct {
    let (fields, unsupported) = match &item.fields {
        syn::Fields::Named(named) => (named.named.iter().map(read_field).collect(), None),
        _ => (
            Vec::new(),
            Some(format!(
                "`{}` is a tuple or unit struct. It has no named fields, so there is no \
                 object shape to emit for it.",
                item.ident
            )),
        ),
    };
    Struct {
        name: item.ident.to_string(),
        docs: docs_of(&item.attrs),
        attrs: serde_attrs(&item.attrs),
        fields,
        unsupported,
    }
}

fn read_enum(item: &syn::ItemEnum) -> Enum {
    let mut variants = Vec::new();
    for v in &item.variants {
        let (fields, unsupported) = match &v.fields {
            syn::Fields::Unit => (None, None),
            syn::Fields::Named(named) => (Some(named.named.iter().map(read_field).collect()), None),
            syn::Fields::Unnamed(_) => (
                None,
                Some(format!(
                    "`{}::{}` is a tuple variant. serde's shape for one is not an object, \
                     so this generator does not emit it; make it a struct variant or keep \
                     it off the boundary.",
                    item.ident, v.ident
                )),
            ),
        };
        variants.push(Variant {
            name: v.ident.to_string(),
            docs: docs_of(&v.attrs),
            attrs: serde_attrs(&v.attrs),
            fields,
            unsupported,
        });
    }
    Enum {
        name: item.ident.to_string(),
        docs: docs_of(&item.attrs),
        attrs: serde_attrs(&item.attrs),
        variants,
    }
}

fn read_field(field: &syn::Field) -> Field {
    Field {
        name: field
            .ident
            .as_ref()
            .map(ToString::to_string)
            .unwrap_or_default(),
        docs: docs_of(&field.attrs),
        ty: field.ty.clone(),
        attrs: serde_attrs(&field.attrs),
    }
}

/// The `///` lines, with the leading space stripped and no trailing blanks.
fn docs_of(attrs: &[syn::Attribute]) -> Vec<String> {
    let mut lines = Vec::new();
    for attr in attrs {
        if !attr.path().is_ident("doc") {
            continue;
        }
        let syn::Meta::NameValue(nv) = &attr.meta else {
            continue;
        };
        let syn::Expr::Lit(syn::ExprLit {
            lit: syn::Lit::Str(s),
            ..
        }) = &nv.value
        else {
            continue;
        };
        lines.push(
            s.value()
                .strip_prefix(' ')
                .unwrap_or(&s.value())
                .to_string(),
        );
    }
    while lines.last().is_some_and(|l| l.trim().is_empty()) {
        lines.pop();
    }
    lines
}

/// The `#[serde(...)]` keys the wire depends on. Unknown keys are ignored.
fn serde_attrs(attrs: &[syn::Attribute]) -> SerdeAttrs {
    let mut out = SerdeAttrs::default();
    for attr in attrs {
        if !attr.path().is_ident("serde") {
            continue;
        }
        let _ = attr.parse_nested_meta(|meta| {
            let key = meta
                .path
                .get_ident()
                .map(ToString::to_string)
                .unwrap_or_default();
            match key.as_str() {
                "default" => out.default = true,
                "flatten" => out.flatten = true,
                "skip_serializing_if" => out.skip_serializing_if = true,
                "rename" => out.rename = meta_str(&meta),
                "rename_all" => out.rename_all = meta_str(&meta),
                "rename_all_fields" => out.rename_all_fields = meta_str(&meta),
                "tag" => out.tag = meta_str(&meta),
                _ => {}
            }
            // Consume any `= "..."` this key carried, so parsing continues.
            if !meta.input.is_empty() && meta.input.peek(syn::Token![=]) {
                let _ = meta.value().and_then(|v| v.parse::<syn::Lit>());
            }
            Ok(())
        });
    }
    out
}

fn meta_str(meta: &syn::meta::ParseNestedMeta<'_>) -> Option<String> {
    let value = meta.value().ok()?;
    let lit: syn::LitStr = value.parse().ok()?;
    Some(lit.value())
}

/// Local names in the wrapper that stand for a public function or constant of
/// the core.
///
/// `use tradecraft_core::publish::{PublishRequest, publish_skill as
/// core_publish_skill}` gives `core_publish_skill -> publish_skill`. Imported
/// types are skipped: only names that resolve to a core function or a core
/// constant are aliases this module can follow to a response type — a
/// function's is its return type, a constant's is the constant's own type
/// (`knownTargets` hands back `KNOWN_TARGETS` rather than calling anything).
fn core_item_aliases(
    items: &[syn::Item],
    fn_returns: &BTreeMap<String, syn::ReturnType>,
    const_types: &BTreeMap<String, syn::Type>,
) -> BTreeMap<String, String> {
    let mut aliases = BTreeMap::new();
    for item in items {
        if let syn::Item::Use(u) = item {
            walk_use_tree(&u.tree, fn_returns, const_types, &mut aliases);
        }
    }
    aliases
}

fn walk_use_tree(
    tree: &syn::UseTree,
    fn_returns: &BTreeMap<String, syn::ReturnType>,
    const_types: &BTreeMap<String, syn::Type>,
    out: &mut BTreeMap<String, String>,
) {
    let is_known = |name: &str| fn_returns.contains_key(name) || const_types.contains_key(name);
    match tree {
        syn::UseTree::Path(p) => walk_use_tree(&p.tree, fn_returns, const_types, out),
        syn::UseTree::Group(g) => {
            for tree in &g.items {
                walk_use_tree(tree, fn_returns, const_types, out);
            }
        }
        syn::UseTree::Name(n) => {
            let name = n.ident.to_string();
            if is_known(&name) {
                out.insert(name.clone(), name);
            }
        }
        syn::UseTree::Rename(r) => {
            let target = r.ident.to_string();
            if is_known(&target) {
                out.insert(r.rename.to_string(), target);
            }
        }
        syn::UseTree::Glob(_) => {}
    }
}

/// Every `#[wasm_bindgen]` function, resolved to its request and response.
fn read_exports(
    items: &[syn::Item],
    aliases: &BTreeMap<String, String>,
    fn_returns: &BTreeMap<String, syn::ReturnType>,
    const_types: &BTreeMap<String, syn::Type>,
) -> Result<Vec<Export>, Error> {
    let mut exports = Vec::new();
    for item in items {
        let syn::Item::Fn(f) = item else { continue };
        let Some(js_name) = wasm_bindgen_name(f) else {
            continue;
        };

        let takes_request = f
            .sig
            .inputs
            .iter()
            .any(|arg| matches!(arg, syn::FnArg::Typed(t) if pat_is(&t.pat, "request_json")));
        let returns_json = returns_result_string(&f.sig.output);

        let request = if takes_request {
            Some(request_type(f).ok_or_else(|| {
                format!(
                    "`{js_name}` takes a `request_json` but its body never names the type \
                     it deserializes into. The generator reads the request type off the \
                     `let <name>: <Type> = serde_json::from_str(request_json)` binding."
                )
            })?)
        } else {
            None
        };

        let response = if returns_json {
            let core_item = called_core_item(f, aliases).ok_or_else(|| {
                format!(
                    "`{js_name}` returns a JSON string but its body does not call exactly \
                     one function, and names no constant, imported from `tradecraft_core`. \
                     The generator reads the response type off that function's return type, \
                     or off a referenced constant's own type."
                )
            })?;
            if let Some(output) = fn_returns.get(&core_item) {
                Some(ok_type(output).ok_or_else(|| {
                    format!("`{core_item}` does not return a `Result<T, _>`, so `{js_name}` has no response type to emit.")
                })?)
            } else {
                let ty = &const_types[&core_item];
                Some(const_response_type(ty).ok_or_else(|| {
                    format!(
                        "`{core_item}` is not a slice or a named type this generator can \
                         resolve to a response shape for `{js_name}`."
                    )
                })?)
            }
        } else {
            None
        };

        exports.push(Export {
            js_name,
            request,
            response,
        });
    }

    if exports.is_empty() {
        return Err("no `#[wasm_bindgen]` exports found in the wrapper".to_string());
    }
    Ok(exports)
}

fn pat_is(pat: &syn::Pat, name: &str) -> bool {
    matches!(pat, syn::Pat::Ident(i) if i.ident == name)
}

/// The JS name of a `#[wasm_bindgen]` function, or `None` if it carries no
/// such attribute.
fn wasm_bindgen_name(f: &syn::ItemFn) -> Option<String> {
    let attr = f.attrs.iter().find(|a| a.path().is_ident("wasm_bindgen"))?;
    let mut js_name = None;
    let _ = attr.parse_nested_meta(|meta| {
        if meta.path.is_ident("js_name") {
            js_name = meta
                .value()
                .ok()
                .and_then(|v| v.parse::<syn::Ident>().ok())
                .map(|i| i.to_string());
        }
        Ok(())
    });
    Some(js_name.unwrap_or_else(|| f.sig.ident.to_string()))
}

fn returns_result_string(output: &syn::ReturnType) -> bool {
    ok_type(output).is_some_and(|(name, list)| name == "String" && !list)
}

/// `Result<T, _>` -> `T`, reported as `(name, is a list)`.
fn ok_type(output: &syn::ReturnType) -> Option<(String, bool)> {
    let syn::ReturnType::Type(_, ty) = output else {
        return None;
    };
    let (head, args) = path_parts(ty)?;
    if head != "Result" {
        return None;
    }
    let ok = args.first()?;
    let (name, inner) = path_parts(ok)?;
    if name == "Vec" {
        let (elem, _) = path_parts(inner.first()?)?;
        return Some((elem, true));
    }
    Some((name, false))
}

/// The last segment of a type path, with its angle-bracketed arguments.
pub fn path_parts(ty: &syn::Type) -> Option<(String, Vec<syn::Type>)> {
    let syn::Type::Path(p) = ty else { return None };
    let seg = p.path.segments.last()?;
    let args = match &seg.arguments {
        syn::PathArguments::AngleBracketed(a) => a
            .args
            .iter()
            .filter_map(|arg| match arg {
                syn::GenericArgument::Type(t) => Some(t.clone()),
                _ => None,
            })
            .collect(),
        _ => Vec::new(),
    };
    Some((seg.ident.to_string(), args))
}

/// The type named by the body's `let <name>: <Type> = serde_json::from_str(..)`.
fn request_type(f: &syn::ItemFn) -> Option<String> {
    for stmt in &f.block.stmts {
        let syn::Stmt::Local(local) = stmt else {
            continue;
        };
        let syn::Pat::Type(pat) = &local.pat else {
            continue;
        };
        let Some(init) = &local.init else { continue };
        if !tokens_of(&init.expr).contains("from_str") {
            continue;
        }
        if let Some((name, _)) = path_parts(&pat.ty) {
            return Some(name);
        }
    }
    None
}

/// The core function or constant this export's body names, by the alias it
/// was imported under. Exactly one is expected; a body naming two is refused,
/// because the response type would then depend on which one this function
/// looked at first.
fn called_core_item(f: &syn::ItemFn, aliases: &BTreeMap<String, String>) -> Option<String> {
    let body = tokens_of(&f.block);
    let mut found: Option<String> = None;
    for (alias, target) in aliases {
        if !body
            .split(|c: char| !c.is_alphanumeric() && c != '_')
            .any(|w| w == alias)
        {
            continue;
        }
        match &found {
            Some(first) if first != target => return None,
            _ => found = Some(target.clone()),
        }
    }
    found
}

fn tokens_of<T: quote::ToTokens>(item: &T) -> String {
    item.to_token_stream().to_string()
}

/// A constant's declared type, read as a response shape: `(name, is a list)`.
///
/// `KNOWN_TARGETS: &[&str]` is how `knownTargets` hands back a list with no
/// core function to call — its body serializes the constant directly. A
/// slice is a list of its element; anything else is read as itself, peeling
/// references first so `&str` resolves the same as `str`.
fn const_response_type(ty: &syn::Type) -> Option<(String, bool)> {
    match peel_refs(ty) {
        syn::Type::Slice(s) => {
            let (name, _) = path_parts(peel_refs(&s.elem))?;
            Some((name, true))
        }
        other => {
            let (name, _) = path_parts(other)?;
            Some((name, false))
        }
    }
}

fn peel_refs(ty: &syn::Type) -> &syn::Type {
    match ty {
        syn::Type::Reference(r) => peel_refs(&r.elem),
        other => other,
    }
}
