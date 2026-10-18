use std::collections::{BTreeMap, BTreeSet};
use std::fs;
use std::path::Path;

use serde::Serialize;
use syn::spanned::Spanned;
use syn::visit::Visit;
use syn::{Attribute, Expr, ExprIf, ImplItemFn, ItemFn, ItemImpl, ItemMod, Meta, Pat, Type};

const REPO: &str = "orhun/rustypaste";
const TAG: &str = "v0.18.0";
const AUTH_KEY: &str = "auth_tokens";
const AUTH_TABLE: &str = "server";

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Corpus {
    pub repo: String,
    pub tag: String,
    pub functions: Vec<Function>,
    pub calls: Vec<Call>,
    pub externals: Vec<External>,
    pub config: ConfigFact,
    pub build: BuildFact,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Function {
    pub id: String,
    pub name: String,
    pub qual: String,
    pub file: String,
    pub line: u32,
    pub header_override_line: Option<u32>,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Call {
    pub caller_id: String,
    pub callee_id: String,
    pub callee_name: String,
    pub order: u32,
    pub line: u32,
    pub inside_header_override: bool,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct External {
    pub id: String,
    pub name: String,
    pub path: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConfigFact {
    pub file: &'static str,
    pub flags: Vec<ConfigFlag>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConfigFlag {
    pub table: &'static str,
    pub key: &'static str,
    pub assigned: bool,
    pub line: u32,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BuildFact {
    pub workflow: &'static str,
    pub dockerfile: &'static str,
    pub pushes_image: bool,
}

#[derive(Debug)]
struct RawCall {
    caller_id: String,
    path: String,
    order: u32,
    line: u32,
    inside_header_override: bool,
}

struct Frame {
    index: usize,
    next_order: u32,
    header_depth: u32,
}

struct Extractor {
    file: String,
    lines: LineIndex,
    functions: Vec<Function>,
    raw_calls: Vec<RawCall>,
    stack: Vec<Frame>,
    impl_ty: Vec<String>,
}

struct LineIndex {
    starts: Vec<usize>,
}

impl LineIndex {
    fn new(source: &str) -> Self {
        let mut starts = vec![0];
        for (index, byte) in source.bytes().enumerate() {
            if byte == b'\n' {
                starts.push(index + 1);
            }
        }
        Self { starts }
    }

    fn line(&self, byte: usize) -> u32 {
        match self.starts.binary_search(&byte) {
            Ok(index) => (index + 1) as u32,
            Err(index) => index as u32,
        }
    }
}

pub fn extract(root: &Path) -> Result<Corpus, String> {
    extract_repo(root, REPO, TAG)
}

pub fn extract_repo(root: &Path, repo: &str, tag: &str) -> Result<Corpus, String> {
    let src = root.join("src");
    if !src.is_dir() {
        return Err(format!("missing {}", src.display()));
    }

    let mut modules = BTreeSet::new();
    let mut files = Vec::new();
    for entry in walkdir::WalkDir::new(&src).into_iter() {
        let entry = entry.map_err(|error| error.to_string())?;
        if !entry.file_type().is_file() {
            continue;
        }
        let path = entry.path();
        if path.extension().and_then(|ext| ext.to_str()) != Some("rs") {
            continue;
        }
        files.push(path.to_path_buf());
    }
    files.sort();

    for path in &files {
        if let Some(module) = module_name(&src, path) {
            modules.insert(module);
        }
    }

    let mut functions = Vec::new();
    let mut raw_calls = Vec::new();
    for path in &files {
        let source = fs::read_to_string(path).map_err(|error| error.to_string())?;
        let parsed = syn::parse_file(&source).map_err(|error| {
            format!("parse {}: {error}", path.display())
        })?;
        let relative = path
            .strip_prefix(root)
            .unwrap_or(path)
            .to_string_lossy()
            .replace('\\', "/");
        let mut extractor = Extractor {
            file: relative,
            lines: LineIndex::new(&source),
            functions: Vec::new(),
            raw_calls: Vec::new(),
            stack: Vec::new(),
            impl_ty: Vec::new(),
        };
        extractor.visit_file(&parsed);
        functions.append(&mut extractor.functions);
        raw_calls.append(&mut extractor.raw_calls);
    }

    let mut externals: BTreeMap<String, External> = BTreeMap::new();
    let mut calls = Vec::new();
    for raw in raw_calls {
        let (callee_id, callee_name, external_path) =
            resolve_callee(&raw.path, &functions, &modules);
        if let Some(path) = external_path {
            externals.entry(callee_id.clone()).or_insert(External {
                id: callee_id.clone(),
                name: callee_name.clone(),
                path,
            });
        }
        calls.push(Call {
            caller_id: raw.caller_id,
            callee_id,
            callee_name,
            order: raw.order,
            line: raw.line,
            inside_header_override: raw.inside_header_override,
        });
    }

    let config_path = root.join("config.toml");
    let flags = if config_path.is_file() {
        let source = fs::read_to_string(&config_path).map_err(|error| error.to_string())?;
        vec![read_auth_tokens(&source)]
    } else {
        Vec::new()
    };

    Ok(Corpus {
        repo: repo.to_string(),
        tag: tag.to_string(),
        functions,
        calls,
        externals: externals.into_values().collect(),
        config: ConfigFact {
            file: "config.toml",
            flags,
        },
        build: read_build(root),
    })
}

fn module_name(src: &Path, path: &Path) -> Option<String> {
    let relative = path.strip_prefix(src).ok()?;
    let mut parts: Vec<String> = relative
        .components()
        .map(|component| component.as_os_str().to_string_lossy().into_owned())
        .collect();
    let file = parts.pop()?;
    if file == "main.rs" || file == "lib.rs" {
        return None;
    }
    let stem = if file == "mod.rs" {
        parts.pop()?
    } else {
        file.trim_end_matches(".rs").to_string()
    };
    if parts.is_empty() {
        Some(stem)
    } else {
        None
    }
}

fn resolve_callee(
    path: &str,
    functions: &[Function],
    modules: &BTreeSet<String>,
) -> (String, String, Option<String>) {
    let segments: Vec<&str> = path.split("::").filter(|segment| !segment.is_empty()).collect();
    let name = segments.last().copied().unwrap_or(path).to_string();
    if segments.len() >= 2 {
        let root = segments[0];
        let local = root == "crate" || root == "self" || root == "super" || modules.contains(root);
        if local {
            if let Some(id) = resolve_local(&segments, &name, functions) {
                return (id, name, None);
            }
        }
        let id = format!("external::{path}");
        return (id, name, Some(path.to_string()));
    }
    let matches: Vec<&Function> = functions.iter().filter(|function| function.name == name).collect();
    if matches.len() == 1 {
        return (matches[0].id.clone(), name, None);
    }
    let id = format!("external::{name}");
    (id, name.clone(), Some(name))
}

fn resolve_local(segments: &[&str], name: &str, functions: &[Function]) -> Option<String> {
    let module = if segments[0] == "crate" {
        segments.get(1).copied()
    } else if segments[0] == "self" || segments[0] == "super" {
        None
    } else {
        Some(segments[0])
    };
    if let Some(module) = module {
        let file = format!("src/{module}.rs");
        if let Some(function) = functions
            .iter()
            .find(|function| function.name == name && function.file == file)
        {
            return Some(function.id.clone());
        }
    }
    let matches: Vec<&Function> = functions.iter().filter(|function| function.name == name).collect();
    if matches.len() == 1 {
        return Some(matches[0].id.clone());
    }
    None
}

fn read_auth_tokens(source: &str) -> ConfigFlag {
    let mut table = String::new();
    let mut commented = None;
    let mut assigned = None;
    for (index, line) in source.lines().enumerate() {
        let line_no = (index + 1) as u32;
        let trimmed = line.trim();
        if let Some(header) = trimmed.strip_prefix('[') {
            if let Some(name) = header.strip_suffix(']') {
                table = name.to_string();
            }
            continue;
        }
        if table != AUTH_TABLE {
            continue;
        }
        let commented_line = trimmed.starts_with('#');
        let code = trimmed.trim_start_matches('#').trim();
        let Some(after_key) = code.strip_prefix(AUTH_KEY) else {
            continue;
        };
        if !after_key.trim_start().starts_with('=') {
            continue;
        }
        if commented_line {
            commented = Some(line_no);
        } else {
            assigned = Some(line_no);
        }
    }
    ConfigFlag {
        table: AUTH_TABLE,
        key: AUTH_KEY,
        assigned: assigned.is_some(),
        line: assigned.or(commented).unwrap_or(0),
    }
}

fn read_build(root: &Path) -> BuildFact {
    let workflow = fs::read_to_string(root.join(".github/workflows/docker.yml")).unwrap_or_default();
    let dockerfile = root.join("Dockerfile").is_file();
    let pushes_image = dockerfile
        && workflow.contains("file: ./Dockerfile")
        && workflow.contains("docker/build-push-action")
        && workflow.contains("v*.*.*");
    BuildFact {
        workflow: ".github/workflows/docker.yml",
        dockerfile: "Dockerfile",
        pushes_image,
    }
}

impl Extractor {
    fn push_fn(&mut self, ty: Option<String>, name: &syn::Ident, span: proc_macro2::Span) {
        let name = name.to_string();
        let qual = match &ty {
            Some(ty) => format!("{ty}::{name}"),
            None => name.clone(),
        };
        let id = match &ty {
            Some(ty) => format!("{}::{ty}::{name}", self.file),
            None => format!("{}::{name}", self.file),
        };
        let line = self.line_of(span);
        self.functions.push(Function {
            id,
            name,
            qual,
            file: self.file.clone(),
            line,
            header_override_line: None,
        });
        self.stack.push(Frame {
            index: self.functions.len() - 1,
            next_order: 1,
            header_depth: 0,
        });
    }

    fn pop_fn(&mut self) {
        self.stack.pop();
    }

    fn line_of(&self, span: proc_macro2::Span) -> u32 {
        self.lines.line(span.byte_range().start)
    }

    fn record_at(&mut self, path: String, span: proc_macro2::Span) {
        let line = self.line_of(span);
        let Some((order, inside, index)) = self.stack.last_mut().map(|frame| {
            let order = frame.next_order;
            frame.next_order += 1;
            (order, frame.header_depth > 0, frame.index)
        }) else {
            return;
        };
        let caller_id = self.functions[index].id.clone();
        self.raw_calls.push(RawCall {
            caller_id,
            path,
            order,
            line,
            inside_header_override: inside,
        });
    }
}

impl<'ast> Visit<'ast> for Extractor {
    fn visit_item_mod(&mut self, item: &'ast ItemMod) {
        if item.ident == "tests" || attrs_are_cfg_test(&item.attrs) {
            return;
        }
        syn::visit::visit_item_mod(self, item);
    }

    fn visit_item_fn(&mut self, item: &'ast ItemFn) {
        if attrs_are_test(&item.attrs) {
            return;
        }
        self.push_fn(None, &item.sig.ident, item.sig.fn_token.span());
        syn::visit::visit_item_fn(self, item);
        self.pop_fn();
    }

    fn visit_item_impl(&mut self, item: &'ast ItemImpl) {
        if attrs_are_test(&item.attrs) {
            return;
        }
        self.impl_ty.push(type_label(&item.self_ty));
        syn::visit::visit_item_impl(self, item);
        self.impl_ty.pop();
    }

    fn visit_impl_item_fn(&mut self, item: &'ast ImplItemFn) {
        if attrs_are_test(&item.attrs) {
            return;
        }
        let ty = self.impl_ty.last().cloned();
        self.push_fn(ty, &item.sig.ident, item.sig.fn_token.span());
        syn::visit::visit_impl_item_fn(self, item);
        self.pop_fn();
    }

    fn visit_expr(&mut self, expr: &'ast Expr) {
        let Expr::If(expr_if) = expr else {
            syn::visit::visit_expr(self, expr);
            return;
        };
        if !is_header_override(expr_if) {
            syn::visit::visit_expr(self, expr);
            return;
        }
        if let Some(frame) = self.stack.last() {
            let index = frame.index;
            if self.functions[index].header_override_line.is_none() {
                self.functions[index].header_override_line = Some(self.line_of(expr.span()));
            }
        }
        self.visit_expr(&expr_if.cond);
        if let Some(frame) = self.stack.last_mut() {
            frame.header_depth += 1;
        }
        for stmt in &expr_if.then_branch.stmts {
            self.visit_stmt(stmt);
        }
        if let Some(frame) = self.stack.last_mut() {
            frame.header_depth = frame.header_depth.saturating_sub(1);
        }
        if let Some((_, else_expr)) = &expr_if.else_branch {
            self.visit_expr(else_expr);
        }
    }

    fn visit_expr_call(&mut self, expr: &'ast syn::ExprCall) {
        syn::visit::visit_expr_call(self, expr);
        let path = match expr.func.as_ref() {
            Expr::Path(path) => path_string(&path.path),
            other => format!("expr:{}", expr_kind(other)),
        };
        self.record_at(path, expr.span());
    }

    fn visit_expr_method_call(&mut self, expr: &'ast syn::ExprMethodCall) {
        syn::visit::visit_expr_method_call(self, expr);
        self.record_at(expr.method.to_string(), expr.span());
    }
}

fn is_header_override(expr: &ExprIf) -> bool {
    let Expr::Let(expr_let) = expr.cond.as_ref() else {
        return false;
    };
    pat_binds(&expr_let.pat, "header_filename")
}

fn pat_binds(pat: &Pat, name: &str) -> bool {
    match pat {
        Pat::Ident(ident) => ident.ident == name,
        Pat::TupleStruct(tuple) => tuple.elems.iter().any(|elem| pat_binds(elem, name)),
        Pat::Tuple(tuple) => tuple.elems.iter().any(|elem| pat_binds(elem, name)),
        Pat::Type(ty) => pat_binds(&ty.pat, name),
        Pat::Reference(reference) => pat_binds(&reference.pat, name),
        Pat::Paren(paren) => pat_binds(&paren.pat, name),
        _ => false,
    }
}

fn type_label(ty: &Type) -> String {
    match ty {
        Type::Path(path) => path
            .path
            .segments
            .last()
            .map(|segment| segment.ident.to_string())
            .unwrap_or_else(|| "Self".to_string()),
        _ => "Self".to_string(),
    }
}

fn path_string(path: &syn::Path) -> String {
    path.segments
        .iter()
        .map(|segment| segment.ident.to_string())
        .collect::<Vec<_>>()
        .join("::")
}

fn expr_kind(expr: &Expr) -> &'static str {
    match expr {
        Expr::Call(_) => "call",
        Expr::MethodCall(_) => "method",
        Expr::Path(_) => "path",
        _ => "other",
    }
}

fn attrs_are_test(attrs: &[Attribute]) -> bool {
    attrs.iter().any(|attr| {
        let path = path_string(attr.path());
        path == "test" || path.ends_with("::test") || attr_is_cfg_test(attr)
    })
}

fn attrs_are_cfg_test(attrs: &[Attribute]) -> bool {
    attrs.iter().any(attr_is_cfg_test)
}

fn attr_is_cfg_test(attr: &Attribute) -> bool {
    if !attr.path().is_ident("cfg") {
        return false;
    }
    let Ok(meta) = attr.parse_args::<Meta>() else {
        return false;
    };
    matches!(meta, Meta::Path(path) if path.is_ident("test"))
}
