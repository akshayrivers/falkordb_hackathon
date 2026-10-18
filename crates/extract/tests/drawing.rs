use sever_extract::{extract, Call, Function};

fn corpus() -> sever_extract::Corpus {
    let root = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../../corpus/rustypaste");
    extract(&root).unwrap_or_else(|error| panic!("{error}"))
}

fn function<'a>(corpus: &'a sever_extract::Corpus, id: &str) -> &'a Function {
    corpus
        .functions
        .iter()
        .find(|function| function.id == id)
        .unwrap_or_else(|| panic!("missing {id}"))
}

fn calls<'a>(corpus: &'a sever_extract::Corpus, id: &str) -> Vec<&'a Call> {
    let mut calls: Vec<&Call> = corpus
        .calls
        .iter()
        .filter(|call| call.caller_id == id)
        .collect();
    calls.sort_by_key(|call| call.order);
    calls
}

fn names(calls: &[&Call]) -> Vec<String> {
    calls
        .iter()
        .map(|call| format!("{}:{}:{}", call.order, call.line, call.callee_name))
        .collect()
}

#[test]
fn store_file_check_then_header_rename_are_one_body() {
    let corpus = corpus();
    let id = "src/paste.rs::Paste::store_file";
    let function = function(&corpus, id);
    let calls = calls(&corpus, id);
    let rendered = names(&calls);

    assert_eq!(function.header_override_line, Some(212), "{rendered:?}");
    assert_eq!(function.line, 132);

    let guards: Vec<&&Call> = calls
        .iter()
        .filter(|call| call.callee_name == "safe_path_join")
        .collect();
    assert_eq!(guards.len(), 1, "{rendered:?}");
    assert_eq!(guards[0].line, 180);
    assert!(!guards[0].inside_header_override);
    assert_eq!(guards[0].callee_id, "src/util.rs::safe_path_join");

    let renames: Vec<&&Call> = calls
        .iter()
        .filter(|call| call.callee_name == "set_file_name")
        .collect();
    assert_eq!(renames.len(), 3, "{rendered:?}");
    assert_eq!(renames[0].line, 208);
    assert!(!renames[0].inside_header_override);
    assert_eq!(renames[1].line, 214);
    assert!(renames[1].inside_header_override);
    assert_eq!(renames[2].line, 227);
    assert!(!renames[2].inside_header_override);
    assert!(renames.iter().all(|call| call.callee_id == "external::set_file_name"));

    assert!(guards[0].order < renames[1].order);
    assert!(renames[0].order < renames[1].order);
    assert!(renames[1].order < renames[2].order);

    let create = calls
        .iter()
        .find(|call| call.callee_name == "create" && call.line == 240)
        .expect("File::create");
    assert!(renames[1].order < create.order);
    assert_eq!(create.callee_id, "external::File::create");
}

#[test]
fn store_url_checks_the_header_before_the_join() {
    let corpus = corpus();
    let id = "src/paste.rs::Paste::store_url";
    let function = function(&corpus, id);
    let calls = calls(&corpus, id);
    let rendered = names(&calls);

    assert_eq!(function.header_override_line, Some(342), "{rendered:?}");
    let guard = calls
        .iter()
        .find(|call| call.callee_name == "safe_path_join")
        .expect("safe_path_join");
    assert_eq!(guard.line, 346);
    assert!(guard.line > function.header_override_line.unwrap());
    assert!(calls
        .iter()
        .all(|call| !(call.callee_name == "set_file_name" && call.inside_header_override)));
    let expiry_rename = calls
        .iter()
        .find(|call| call.callee_name == "set_file_name")
        .expect("expiry set_file_name");
    assert_eq!(expiry_rename.line, 348);
    assert!(guard.order < expiry_rename.order);
}

#[test]
fn auth_tokens_is_unassigned_and_the_image_workflow_pushes() {
    let corpus = corpus();
    assert_eq!(corpus.tag, "v0.18.0");
    assert_eq!(corpus.repo, "orhun/rustypaste");
    let flag = &corpus.config.flags[0];
    assert_eq!(flag.table, "server");
    assert_eq!(flag.key, "auth_tokens");
    assert!(!flag.assigned);
    assert_eq!(flag.line, 13);
    assert!(corpus.build.pushes_image);
    assert_eq!(corpus.build.workflow, ".github/workflows/docker.yml");
    assert_eq!(corpus.build.dockerfile, "Dockerfile");
}

#[test]
fn direct_uncovered_path_is_two_hops() {
    let corpus = corpus();
    let upload = "src/server.rs::upload";
    let store_file = "src/paste.rs::Paste::store_file";
    let sink = "external::set_file_name";
    assert!(calls(&corpus, upload)
        .iter()
        .any(|call| call.callee_id == store_file));
    let hops = hop_count(&corpus, upload, sink);
    assert_eq!(
        hops, 2,
        "upload to the header rename is 2 CALLS edges, so maxLen 3 does not cut it"
    );
    let remote = hop_count(&corpus, upload, store_file);
    assert_eq!(remote, 1);
    let through_remote = hop_count_via(&corpus, upload, "src/paste.rs::Paste::store_remote_file", sink);
    assert_eq!(through_remote, 3);
}

fn hop_count(corpus: &sever_extract::Corpus, start: &str, goal: &str) -> u32 {
    let mut seen = std::collections::BTreeSet::from([start.to_string()]);
    let mut edge = vec![start.to_string()];
    let mut depth = 0;
    while !edge.is_empty() {
        depth += 1;
        let mut next = Vec::new();
        for caller in &edge {
            for call in corpus.calls.iter().filter(|call| &call.caller_id == caller) {
                if call.callee_id == goal {
                    return depth;
                }
                if seen.insert(call.callee_id.clone()) {
                    next.push(call.callee_id.clone());
                }
            }
        }
        edge = next;
        if depth > 8 {
            break;
        }
    }
    panic!("no path from {start} to {goal}");
}

fn hop_count_via(corpus: &sever_extract::Corpus, start: &str, via: &str, goal: &str) -> u32 {
    hop_count(corpus, start, via) + hop_count(corpus, via, goal)
}

#[test]
fn a_crate_without_config_toml_still_emits_calls() {
    let root = std::env::temp_dir().join(format!("sever-generic-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&root);
    std::fs::create_dir_all(root.join("src")).unwrap();
    std::fs::write(
        root.join("src/lib.rs"),
        "pub fn ping() { pong(); }\nfn pong() {}\n",
    )
    .unwrap();
    let corpus = sever_extract::extract_repo(&root, "example/ping", "local").unwrap();
    assert_eq!(corpus.repo, "example/ping");
    assert_eq!(corpus.tag, "local");
    assert!(corpus.config.flags.is_empty());
    assert!(corpus.functions.iter().any(|function| function.name == "ping"));
    assert!(corpus.calls.iter().any(|call| call.callee_name == "pong"));
    let _ = std::fs::remove_dir_all(&root);
}
