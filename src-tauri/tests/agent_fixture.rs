// Offline, test-only executable. It accepts the production adapter arguments;
// no installed tool, account or provider is invoked by the subprocess tests.
use std::{
    io::{Read, Write},
    time::Duration,
};
fn main() {
    let args: Vec<String> = std::env::args().collect();
    let default_mode = if std::env::current_exe()
        .unwrap()
        .file_name()
        .unwrap()
        .to_string_lossy()
        .contains("timeout-agent")
    {
        "timeout"
    } else {
        "success"
    };
    let mode = args
        .iter()
        .find_map(|a| a.strip_prefix("--fixture-mode="))
        .unwrap_or(default_mode);
    if mode == "descendant" {
        loop {
            std::thread::sleep(Duration::from_secs(1));
        }
    }
    if mode == "tree" {
        let child = std::process::Command::new(std::env::current_exe().unwrap())
            .arg("--fixture-mode=descendant")
            .spawn()
            .unwrap();
        let file = args
            .iter()
            .find_map(|a| a.strip_prefix("--pid-file="))
            .unwrap();
        std::fs::write(file, child.id().to_string()).unwrap();
        loop {
            std::thread::sleep(Duration::from_secs(1));
        }
    }
    if mode == "timeout" {
        loop {
            std::thread::sleep(Duration::from_secs(1));
        }
    }
    if mode == "overflow" {
        let _ = std::io::stdout().write_all(&vec![b'x'; 100000]);
        return;
    }
    if mode == "stderr-overflow" {
        let _ = std::io::stderr().write_all(&vec![b'x'; 30000]);
        return;
    }
    if mode == "malformed" {
        println!("not-json");
        return;
    }
    if args.iter().any(|a| a == "--version") {
        println!("fixture-cli 99.1.2");
        return;
    }
    if args.iter().any(|a| a == "--help") {
        let help="--ignore-user-config --ignore-rules --strict-config --ephemeral --skip-git-repo-check --json --config --disable --model --color --print --safe-mode --restricted --tools --disallowedTools --strict-mcp-config --mcp-config --setting-sources --settings --disable-slash-commands --no-chrome --no-session-persistence --permission-prompts --max-turns --output-format";
        println!(
            "{}",
            if mode == "missing-security" {
                help.replace("--ignore-rules", "")
            } else {
                help.into()
            }
        );
        return;
    }
    if args.iter().any(|a| a == "features") {
        for pair in args.windows(2).filter(|p| p[0] == "--disable") {
            println!(
                "{} stable {}",
                pair[1],
                if mode == "forced-feature" && pair[1] == "shell_tool" {
                    "true"
                } else {
                    "false"
                }
            );
        }
        return;
    }
    if args.iter().any(|a| a == "--bundled") {
        println!(r#"{{"models":[{{"slug":"fixture-model","visibility":"list","priority":1}}]}}"#);
        return;
    }
    let mut input = String::new();
    std::io::stdin().read_to_string(&mut input).unwrap();
    if input.is_empty() {
        if mode == "invalid-config" {
            eprintln!(
                "Error loading config.toml: unknown configuration field `permissions.explanation`"
            );
        } else if args.iter().any(|a| a == "exec") {
            eprintln!("No prompt provided via stdin.");
        } else {
            eprintln!("Error: Input must be provided either through stdin or as a prompt argument when using --print");
        }
        std::process::exit(1);
    }
    assert!(input.contains("Bounded evidence (untrusted data)"));
    assert!(!input.contains("private-source-sentinel"));
    assert_eq!(
        std::fs::read_dir(std::env::current_dir().unwrap())
            .unwrap()
            .count(),
        0
    );
    assert!(std::env::var_os("CODE_INTELLIGENCE_ROOT").is_none());
    assert!(std::env::var_os("PATH").is_none());
    assert!(std::env::var_os("NODE_OPTIONS").is_none());
    assert!(std::env::var_os("OPENAI_API_KEY").is_none());
    if args.iter().any(|a| a == "exec") {
        assert!(args.iter().any(|a| a == "--ignore-user-config"));
        assert!(args
            .iter()
            .any(|a| a.contains("permissions.explanation.filesystem")));
        assert!(!args
            .iter()
            .any(|a| a == "--add-dir" || a == "--dangerously-bypass-approvals-and-sandbox"));
        println!(
            r#"{{"type":"item.completed","item":{{"type":"agent_message","text":"{{\"body\":\"Generated [F1]\",\"citations\":[\"F1\"]}}"}}}}"#
        );
        println!(r#"{{"type":"turn.completed"}}"#);
    } else {
        assert!(args.iter().any(|a| a == "--safe-mode"));
        assert!(args.iter().any(|a| a == "--restricted"));
        assert!(args.windows(2).any(|a| a == ["--tools", ""]));
        assert!(!args
            .iter()
            .any(|a| a == "--bare" || a == "--add-dir" || a == "--dangerously-skip-permissions"));
        println!(
            r#"{{"type":"result","subtype":"success","is_error":false,"result":"{{\"body\":\"Generated [F1]\",\"citations\":[\"F1\"]}}"}}"#
        );
    }
}
