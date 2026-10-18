use std::env;
use std::path::Path;
use std::process::ExitCode;

fn main() -> ExitCode {
    let Some(root) = env::args().nth(1) else {
        eprintln!("usage: sever-extract <crate-root> [repo] [tag]");
        return ExitCode::from(2);
    };
    let repo = env::args().nth(2);
    let tag = env::args().nth(3);
    let parsed = match (repo, tag) {
        (Some(repo), Some(tag)) => sever_extract::extract_repo(Path::new(&root), &repo, &tag),
        _ => sever_extract::extract(Path::new(&root)),
    };
    match parsed {
        Ok(corpus) => {
            println!("{}", serde_json::to_string_pretty(&corpus).unwrap());
            ExitCode::SUCCESS
        }
        Err(error) => {
            eprintln!("{error}");
            ExitCode::FAILURE
        }
    }
}
