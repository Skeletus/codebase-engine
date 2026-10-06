use std::path::Path;
use tauri_plugin_shell::process::Command;

const MAX_STDERR: usize = 16 * 1024;

/// Normalize only the application-owned Node entry argument. Root authority
/// remains the canonical native path and is independently checked by the engine.
/// Node 24's main-module loader uses JS realpathSync, which rejects Windows
/// extended-length entry paths before any of our engine code can run.
fn node_entry(entry: &Path) -> Result<String, String> {
    let value = entry.to_str().ok_or("Invalid engine resource path")?;
    #[cfg(windows)]
    {
        if let Some(unc) = value.strip_prefix(r"\\?\UNC\") {
            return Ok(format!(r"\\{unc}"));
        }
        if let Some(drive) = value.strip_prefix(r"\\?\") {
            let bytes = drive.as_bytes();
            if bytes.len() >= 3 && bytes[0].is_ascii_alphabetic() && bytes[1..3] == *b":\\" {
                return Ok(drive.to_owned());
            }
            return Err("Unsupported engine resource namespace".into());
        }
    }
    Ok(value.to_owned())
}

pub fn engine_command(command: Command, resources: &Path, root: &Path) -> Result<Command, String> {
    entry_command(command, resources, "sidecar.ts", Some(root))
}
pub fn storage_command(
    command: Command,
    resources: &Path,
    database: &Path,
    root: Option<&Path>,
) -> Result<Command, String> {
    Ok(entry_command(command, resources, "storage.ts", root)?
        .env("CODE_INTELLIGENCE_DB", database.as_os_str()))
}
fn entry_command(
    command: Command,
    resources: &Path,
    script: &str,
    root: Option<&Path>,
) -> Result<Command, String> {
    let entry = resources.join("scripts").join(script);
    if !entry.is_file() {
        return Err("Bundled engine is missing; run desktop:prepare".into());
    }
    let mut command = command
        .args([
            "--disable-warning=ExperimentalWarning",
            &node_entry(&entry)?,
        ])
        .env_clear()
        .current_dir(resources);
    if let Some(root) = root {
        command = command.env("CODE_INTELLIGENCE_ROOT", root.as_os_str());
    }
    // Rust really clears the Windows environment. Node's spawn() silently
    // restores OS variables, which hid this in the old Node-only smoke test.
    // OpenSSL's Windows CSPRNG needs SystemRoot; preserve that one OS path,
    // never PATH, NODE_OPTIONS, cloud credentials, or the full parent env.
    #[cfg(windows)]
    let command = {
        let system_root = std::env::var_os("SystemRoot")
            .ok_or("Windows SystemRoot is missing; the engine cannot initialize cryptography")?;
        if !Path::new(&system_root).is_absolute() || !Path::new(&system_root).is_dir() {
            return Err(
                "Windows SystemRoot is invalid; the engine cannot initialize cryptography".into(),
            );
        }
        command.env("SystemRoot", system_root)
    };
    Ok(command)
}

/// Bounded, transient capture only. Raw stderr can contain source or credentials
/// from exceptions; the UI gets runtime codes and known explanations, never the
/// raw text, source excerpts, arbitrary paths, or environment values.
#[derive(Default)]
pub struct EngineDiagnostics {
    stderr: Vec<u8>,
    stage: &'static str,
    truncated: bool,
}
impl EngineDiagnostics {
    pub fn capture(&mut self, bytes: &[u8]) {
        let remaining = MAX_STDERR.saturating_sub(self.stderr.len());
        self.truncated |= bytes.len() >= remaining;
        self.stderr
            .extend_from_slice(&bytes[..bytes.len().min(remaining)]);
        if self.stderr.len() < MAX_STDERR {
            self.stderr.push(b'\n');
        }
    }
    pub fn stage(&mut self, stage: &str) {
        self.stage = match stage {
            "select" => "selection",
            "parse" => "parsing",
            "validate" => "validation",
            "complete" => "the ready state",
            _ => "startup",
        };
    }
    fn detail(&self) -> String {
        let text = String::from_utf8_lossy(&self.stderr);
        let mut detail = String::new();
        for (code, description) in [
            ("EISDIR", "illegal operation on a directory"),
            ("ENOENT", "file or directory not found"),
            ("EACCES", "filesystem access denied"),
            ("EPERM", "operation not permitted"),
            (
                "ERR_MODULE_NOT_FOUND",
                "bundled module could not be resolved",
            ),
            ("MODULE_NOT_FOUND", "bundled module could not be resolved"),
            (
                "ERR_UNKNOWN_FILE_EXTENSION",
                "unsupported engine file extension",
            ),
            (
                "ERR_UNSUPPORTED_ESM_URL_SCHEME",
                "unsupported module path URL",
            ),
            (
                "ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING",
                "unsupported TypeScript runtime location",
            ),
            (
                "ERR_PACKAGE_PATH_NOT_EXPORTED",
                "bundled package entry is not exported",
            ),
        ] {
            if text.contains(&format!("code: '{code}'"))
                || text.contains(&format!("Error: {code}:"))
                || text.contains(&format!("[{code}]"))
            {
                detail = format!("Node {code}: {description}");
                for syscall in ["lstat", "stat", "open", "scandir", "realpath", "read"] {
                    if text.contains(&format!("syscall: '{syscall}'")) {
                        detail.push_str(&format!(" ({syscall})"));
                        break;
                    }
                }
                detail.push('.');
                break;
            }
        }
        if text.contains("FATAL ERROR:")
            && text.contains("heap")
            && text.contains("Allocation failed")
        {
            detail = "Node exhausted its JavaScript heap memory.".into();
        }
        if text.contains("Assertion failed: ncrypto::CSPRNG(nullptr, 0)") {
            detail = "Node cryptographic random-generator initialization failed (CSPRNG). Check the platform launch environment".into();
            #[cfg(windows)]
            detail.push_str(", including SystemRoot");
            detail.push('.');
        }
        #[cfg(windows)]
        if detail.is_empty() {
            if text.contains("os error 2") {
                detail = "Windows could not find the bundled runtime (OS error 2).".into();
            } else if text.contains("os error 5") {
                detail = "Windows denied access to the bundled runtime (OS error 5).".into();
            }
        }
        if text.contains("node:internal/modules/run_main") {
            detail.push_str(" Node failed while loading the bundled entry script.");
        }
        if detail.is_empty() && !self.stderr.is_empty() {
            detail =
                "Unrecognized stderr was captured; raw content is withheld for privacy.".into();
        }
        if self.truncated {
            detail.push_str(" Stderr capture reached its 16 KiB limit.");
        }
        detail
    }
    pub fn exited(&self, code: Option<i32>, signal: Option<i32>) -> String {
        let stage = if self.stage.is_empty() {
            "startup"
        } else {
            self.stage
        };
        let status = match (code, signal) {
            (Some(code), _) => format!("exit code {code}"),
            (_, Some(signal)) => format!("signal {signal}"),
            _ => "exit status unavailable".into(),
        };
        format!(
            "Engine exited during {stage} ({status}). {} Retry analysis.",
            self.detail()
        )
    }
    pub fn transport_error(&mut self, error: &str) -> String {
        self.capture(error.as_bytes());
        let stage = if self.stage.is_empty() {
            "startup"
        } else {
            self.stage
        };
        format!(
            "Engine process transport failed during {stage}. {} Retry analysis.",
            self.detail()
        )
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn diagnostics_preserve_runtime_cause_exit_and_stage_without_source_or_secrets() {
        let mut diagnostics = EngineDiagnostics::default();
        diagnostics.capture(b"Error: EISDIR: illegal operation on a directory, lstat 'D:'\ncode: 'EISDIR'\nsyscall: 'lstat'\nat node:internal/modules/run_main:35:21\nconst secret = 'private-source';\nOPENAI_API_KEY=private-key\n/private/repository.ts");
        let message = diagnostics.exited(Some(1), None);
        assert!(message.contains("startup (exit code 1)"));
        assert!(
            message.contains("Node EISDIR")
                && message.contains("lstat")
                && message.contains("bundled entry script")
        );
        for secret in [
            "private-source",
            "private-key",
            "repository.ts",
            "OPENAI_API_KEY",
            "const secret",
        ] {
            assert!(!message.contains(secret));
        }
        diagnostics.stage("parse");
        assert!(diagnostics
            .exited(None, Some(9))
            .contains("parsing (signal 9)"));
        diagnostics.capture(&vec![b'x'; MAX_STDERR * 4]);
        assert_eq!(diagnostics.stderr.len(), MAX_STDERR);
        assert!(diagnostics.exited(Some(1), None).contains("16 KiB"));
        assert!(diagnostics.exited(Some(1), None).len() < 1024);
        let mut crypto = EngineDiagnostics::default();
        crypto.capture(b"Assertion failed: ncrypto::CSPRNG(nullptr, 0)\nprivate-source");
        let message = crypto.exited(Some(134), None);
        assert!(message.contains("CSPRNG") && message.contains("exit code 134"));
        assert!(!message.contains("private-source"));
        let mut unknown = EngineDiagnostics::default();
        assert!(!unknown
            .transport_error("secret unknown error")
            .contains("secret unknown"));
    }

    #[test]
    #[cfg(windows)]
    fn node_entry_handles_drive_spaces_and_unc_without_changing_root_authority() {
        assert_eq!(
            node_entry(Path::new(
                r"\\?\D:\Repositorios Github\app\engine\scripts\sidecar.ts"
            ))
            .unwrap(),
            r"D:\Repositorios Github\app\engine\scripts\sidecar.ts"
        );
        assert_eq!(
            node_entry(Path::new(
                r"\\?\UNC\server\share with spaces\engine\sidecar.ts"
            ))
            .unwrap(),
            r"\\server\share with spaces\engine\sidecar.ts"
        );
        assert!(node_entry(Path::new(r"\\?\Volume{unknown}\engine\sidecar.ts")).is_err());
    }

    #[test]
    fn shell_plugin_launches_packaged_engine_with_canonical_paths_and_spaces() {
        use tauri_plugin_shell::{process::CommandEvent, ShellExt};
        let app = tauri::test::mock_builder()
            .plugin(tauri_plugin_shell::init())
            .build(tauri::test::mock_context(tauri::test::noop_assets()))
            .unwrap();
        let manifest = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"));
        // A workspace-owned scratch root; never edit the user's selected repo.
        let scratch = manifest
            .join("target")
            .join(format!("phase-02 spaces-{}", std::process::id()));
        std::fs::create_dir(&scratch).unwrap();
        std::fs::write(
            scratch.join("a.ts"),
            "import { b } from './b'; export const a = b;",
        )
        .unwrap();
        std::fs::write(scratch.join("b.ts"), "export const b = 1;").unwrap();
        let root = scratch.canonicalize().unwrap();
        // Optional, explicit read-only reproduction against a real local root.
        // This exists only in tests and never adds a renderer command.
        let actual_root = std::env::var_os("CODE_INTELLIGENCE_TEST_ROOT")
            .map(|root| std::path::PathBuf::from(root).canonicalize().unwrap());
        let root = actual_root.clone().unwrap_or(root);
        // canonicalize reproduces Tauri's Windows resource prefix. Unlike the
        // old Node-only smoke test, exercise the actual shell-plugin command.
        let resources = manifest.join("target/debug/engine").canonicalize().unwrap();
        let command = engine_command(
            app.shell().sidecar("code-engine").unwrap(),
            &resources,
            &root,
        )
        .unwrap();
        let inspection: std::process::Command = engine_command(
            app.shell().sidecar("code-engine").unwrap(),
            &resources,
            &root,
        )
        .unwrap()
        .into();
        let mut env_names: Vec<_> = inspection
            .get_envs()
            .filter(|(_, value)| value.is_some())
            .map(|(key, _)| key.to_string_lossy().to_uppercase())
            .collect();
        env_names.sort();
        #[cfg(windows)]
        assert_eq!(env_names, ["CODE_INTELLIGENCE_ROOT", "SYSTEMROOT"]);
        #[cfg(not(windows))]
        assert_eq!(env_names, ["CODE_INTELLIGENCE_ROOT"]);
        let (mut events, mut child) = command.spawn().unwrap();
        child.write(format!("{}\n", serde_json::json!({"version":1,"requestId":"native-test","jobId":"native-test","type":"analyze","snapshotVersion":3,"root":root})).as_bytes()).unwrap();
        let (completed, completion) = std::sync::mpsc::channel();
        let result = std::thread::spawn(move || {
            tauri::async_runtime::block_on(async move {
                let mut complete = false;
                let mut diagnostics = EngineDiagnostics::default();
                while let Some(event) = events.recv().await {
                    match event {
                        CommandEvent::Stdout(bytes) => {
                            let event = crate::decode_event(&bytes, "native-test").unwrap();
                            if event["type"] == "complete" {
                                let files = event["snapshot"]["files"].as_array().unwrap().len();
                                let edges =
                                    event["snapshot"]["relationships"].as_array().unwrap().len();
                                let returned_root = Path::new(
                                    event["snapshot"]["origin"]["root"].as_str().unwrap(),
                                )
                                .canonicalize()
                                .unwrap();
                                assert_eq!(returned_root, root);
                                if actual_root.is_none() {
                                    assert_eq!((files, edges), (2, 1));
                                } else {
                                    println!("Native shell launch completed: {files} files, {edges} verified import edges");
                                }
                                complete = true;
                                let _ = completed.send(());
                            }
                        }
                        CommandEvent::Stderr(bytes) => diagnostics.capture(&bytes),
                        CommandEvent::Terminated(status) => {
                            return (
                                complete && status.code == Some(0),
                                diagnostics.exited(status.code, status.signal),
                            );
                        }
                        CommandEvent::Error(error) => {
                            return (false, diagnostics.transport_error(&error))
                        }
                        _ => {}
                    }
                }
                (false, "Engine event stream closed".into())
            })
        });
        if completion
            .recv_timeout(std::time::Duration::from_secs(30))
            .is_ok()
        {
            drop(child); // EOF must shut down cleanly.
        } else {
            let _ = child.kill();
        }
        let (passed, diagnostic) = result.join().unwrap();
        // Exact, fixed child of target; no recursive deletion of a computed root.
        std::fs::remove_file(scratch.join("a.ts")).unwrap();
        std::fs::remove_file(scratch.join("b.ts")).unwrap();
        std::fs::remove_dir(&scratch).unwrap();
        assert!(passed, "{diagnostic}");
    }

    #[test]
    fn shell_plugin_launches_sqlite_with_private_extended_paths_and_no_cloud_environment() {
        use tauri_plugin_shell::{process::CommandEvent, ShellExt};
        let app = tauri::test::mock_builder()
            .plugin(tauri_plugin_shell::init())
            .build(tauri::test::mock_context(tauri::test::noop_assets()))
            .unwrap();
        let manifest = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"));
        let scratch = manifest
            .join("target")
            .join(format!("phase-03 sqlite spaces-{}", std::process::id()));
        std::fs::create_dir(&scratch).unwrap();
        let root = scratch.canonicalize().unwrap();
        let database = root.join("intelligence.sqlite");
        let resources = manifest.join("target/debug/engine").canonicalize().unwrap();
        let inspection: std::process::Command = storage_command(
            app.shell().sidecar("code-engine").unwrap(),
            &resources,
            &database,
            Some(&root),
        )
        .unwrap()
        .into();
        let mut names: Vec<_> = inspection
            .get_envs()
            .filter(|(_, value)| value.is_some())
            .map(|(name, _)| name.to_string_lossy().to_uppercase())
            .collect();
        names.sort();
        #[cfg(windows)]
        assert_eq!(
            names,
            [
                "CODE_INTELLIGENCE_DB",
                "CODE_INTELLIGENCE_ROOT",
                "SYSTEMROOT"
            ]
        );
        #[cfg(not(windows))]
        assert_eq!(names, ["CODE_INTELLIGENCE_DB", "CODE_INTELLIGENCE_ROOT"]);
        for request in [
            serde_json::json!({"version":1,"type":"register"}),
            serde_json::json!({"version":1,"type":"theme","theme":"dark"}),
            serde_json::json!({"version":1,"type":"settings","initialTheme":"light"}),
        ] {
            let (mut events, mut child) = storage_command(
                app.shell().sidecar("code-engine").unwrap(),
                &resources,
                &database,
                Some(&root),
            )
            .unwrap()
            .spawn()
            .unwrap();
            child.write(format!("{request}\n").as_bytes()).unwrap();
            let output = tauri::async_runtime::block_on(async {
                let mut reply = None;
                let mut diagnostics = EngineDiagnostics::default();
                while let Some(event) = events.recv().await {
                    match event {
                        CommandEvent::Stdout(bytes) => {
                            reply =
                                Some(serde_json::from_slice::<serde_json::Value>(&bytes).unwrap());
                        }
                        CommandEvent::Stderr(bytes) => diagnostics.capture(&bytes),
                        CommandEvent::Terminated(status) => {
                            assert_eq!(
                                status.code,
                                Some(0),
                                "{}",
                                diagnostics.exited(status.code, status.signal)
                            );
                            return reply.unwrap();
                        }
                        CommandEvent::Error(error) => {
                            panic!("{}", diagnostics.transport_error(&error))
                        }
                        _ => {}
                    }
                }
                panic!("Storage event stream closed");
            });
            assert_eq!(output["ok"], true, "{output}");
            if request["type"] == "settings" {
                assert_eq!(output["result"]["theme"], "dark");
            }
        }
        std::fs::remove_file(database).unwrap();
        std::fs::remove_dir(scratch).unwrap();
    }

    #[test]
    fn shell_plugin_reports_real_node_bootstrap_stderr_and_exit_code() {
        use tauri_plugin_shell::ShellExt;
        let app = tauri::test::mock_builder()
            .plugin(tauri_plugin_shell::init())
            .build(tauri::test::mock_context(tauri::test::noop_assets()))
            .unwrap();
        let resources = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("target/debug/engine")
            .canonicalize()
            .unwrap();
        let missing = node_entry(&resources.join("scripts/phase-02-missing-entry.ts")).unwrap();
        let command = app
            .shell()
            .sidecar("code-engine")
            .unwrap()
            .args(["--disable-warning=ExperimentalWarning", &missing])
            .env_clear()
            .current_dir(&resources);
        // This command deliberately bypasses the valid-entry helper to provoke
        // a module failure. Supply the required OS variable, not parent env.
        #[cfg(windows)]
        let command = command.env("SystemRoot", std::env::var_os("SystemRoot").unwrap());
        let output = tauri::async_runtime::block_on(command.output()).unwrap();
        assert_eq!(output.status.code(), Some(1));
        let mut diagnostics = EngineDiagnostics::default();
        diagnostics.capture(&output.stderr);
        let message = diagnostics.exited(output.status.code(), None);
        assert!(message.contains("MODULE_NOT_FOUND"), "{message}");
        assert!(message.contains("exit code 1"));
        assert!(!message.contains("phase-02-missing-entry"));
    }
}
