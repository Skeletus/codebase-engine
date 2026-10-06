//! Installed CLI adapters. No renderer-controlled executable, cwd, args or env.
//! Account credentials remain owned by the tool; we never open its auth files.
use crate::Reply;
use serde_json::Value;
use std::{
    io::{Read, Write},
    path::{Path, PathBuf},
    process::{Child, Command, Stdio},
    sync::{
        atomic::{AtomicBool, AtomicU64, Ordering},
        Arc,
    },
    time::{Duration, Instant},
};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Agent {
    Codex,
    Claude,
}
impl Agent {
    #[cfg(test)]
    pub fn id(self) -> &'static str {
        match self {
            Self::Codex => "codex",
            Self::Claude => "claude-code",
        }
    }
}
#[derive(Clone)]
pub struct Installation {
    pub agent: Agent,
    executable: PathBuf,
    prefix: Vec<String>,
    pub version: String,
    pub model: String,
    pub identity: String,
}

// Version is recorded, never used as a compatibility allowlist. Qualification
// inspects the actual command parser, effective features and strict startup.
fn version_label(bytes: &[u8]) -> Result<String, String> {
    let value = std::str::from_utf8(bytes)
        .map_err(|_| "Unsupported capability: readable CLI version")?
        .trim();
    if value.is_empty() || value.len() > 160 || value.chars().any(char::is_control) {
        return Err("Unsupported capability: bounded CLI version".into());
    }
    Ok(value.to_owned())
}
const CODEX_OPTIONS: &[&str] = &[
    "--ignore-user-config",
    "--ignore-rules",
    "--strict-config",
    "--ephemeral",
    "--skip-git-repo-check",
    "--json",
    "--config",
    "--disable",
    "--model",
    "--color",
];
const CLAUDE_OPTIONS: &[&str] = &[
    "--print",
    "--safe-mode",
    "--restricted",
    "--tools",
    "--disallowedTools",
    "--strict-mcp-config",
    "--mcp-config",
    "--setting-sources",
    "--settings",
    "--disable-slash-commands",
    "--no-chrome",
    "--no-session-persistence",
    "--permission-prompts",
    "--max-turns",
    "--model",
    "--output-format",
];
fn missing_options(agent: Agent, help: &str) -> Vec<&'static str> {
    let words: Vec<_> = help
        .split(|c: char| !(c.is_ascii_alphanumeric() || c == '-'))
        .collect();
    let required = if agent == Agent::Codex {
        CODEX_OPTIONS
    } else {
        CLAUDE_OPTIONS
    };
    required
        .iter()
        .copied()
        .filter(|flag| !words.contains(flag))
        .collect()
}
fn model_from_catalog(bytes: &[u8]) -> Result<String, String> {
    let catalog: Value = serde_json::from_slice(bytes)
        .map_err(|_| "Unsupported capability: offline JSON model catalog")?;
    catalog["models"]
        .as_array()
        .ok_or("Unsupported capability: model catalog entries")?
        .iter()
        .filter(|m| m["visibility"] == "list")
        .filter_map(|m| {
            let name = m["slug"].as_str()?;
            if name.is_empty()
                || name.len() > 80
                || !name
                    .bytes()
                    .all(|b| b.is_ascii_alphanumeric() || b"-_.".contains(&b))
            {
                return None;
            }
            Some((m["priority"].as_i64().unwrap_or(i64::MAX), name))
        })
        .min_by(|a, b| a.cmp(b))
        .map(|(_, name)| name.to_owned())
        .ok_or("Unsupported capability: visible bounded model in offline catalog".into())
}
fn empty_input_validated(agent: Agent, output: &ProcessOutput) -> bool {
    let text = String::from_utf8_lossy(&output.stderr).to_ascii_lowercase();
    output.code == Some(1)
        && output.stdout.is_empty()
        && match agent {
            Agent::Codex => text.trim() == "no prompt provided via stdin.",
            Agent::Claude => text.contains("input must be provided") && text.contains("--print"),
        }
}
fn qualify(exe: &Path, prefix: &[String], agent: Agent) -> Result<(String, String), String> {
    let probe = |args: &[String]| {
        run_output(
            exe,
            prefix,
            args,
            "",
            Duration::from_secs(10),
            Arc::new(AtomicBool::new(false)),
            64000,
        )
    };
    let version = version_label(&run(
        exe,
        prefix,
        &["--version".into()],
        "",
        Duration::from_secs(5),
        Arc::new(AtomicBool::new(false)),
    )?)?;
    let help_args = if agent == Agent::Codex {
        vec!["exec".into(), "--help".into()]
    } else {
        vec!["--help".into()]
    };
    let help_output = probe(&help_args)?;
    if help_output.code != Some(0) {
        return Err(format!(
            "Unsupported capability: noninteractive help; {}",
            process_failure(&help_output)
        ));
    }
    let help = String::from_utf8_lossy(&help_output.stdout);
    let missing = missing_options(agent, &help);
    if agent == Agent::Codex && !missing.is_empty() {
        return Err(format!("Unsupported capability: {}", missing.join(", ")));
    }
    let model = if agent == Agent::Codex {
        let mut args: Vec<String> = CODEX_DISABLED
            .iter()
            .flat_map(|f| ["--disable".into(), (*f).into()])
            .collect();
        args.extend(["features".into(), "list".into()]);
        let features = probe(&args)?;
        if features.code != Some(0) {
            return Err(format!(
                "Unsupported capability: effective feature inspection; {}",
                process_failure(&features)
            ));
        }
        for feature in CODEX_DISABLED {
            if !switch_disabled(&features.stdout, feature) {
                return Err(format!(
                    "Unsupported capability: {feature} cannot be verified disabled"
                ));
            }
        }
        let catalog = run_output(
            exe,
            prefix,
            &["debug".into(), "models".into(), "--bundled".into()],
            "",
            Duration::from_secs(10),
            Arc::new(AtomicBool::new(false)),
            1024 * 1024,
        )?;
        if catalog.code != Some(0) {
            return Err(format!(
                "Unsupported capability: offline bundled model discovery; {}",
                process_failure(&catalog)
            ));
        }
        model_from_catalog(&catalog.stdout)?
    } else {
        "sonnet".into()
    };
    // Unlike --help, empty-input startup actually validates strict config fields
    // and permissions profiles. No user prompt or evidence is provided.
    let empty = probe(&arguments(agent, &model))?;
    if !empty_input_validated(agent, &empty) {
        let missing = if missing.is_empty() {
            String::new()
        } else {
            format!(" (unadvertised controls: {})", missing.join(", "))
        };
        return Err(format!(
            "Unsupported capability: secure empty-input startup{missing}; {}",
            process_failure(&empty)
        ));
    }
    Ok((version, model))
}

fn installed_candidates(agent: Agent) -> Vec<(PathBuf, Vec<String>)> {
    let mut dirs = Vec::new();
    if let Some(home) = std::env::var_os("USERPROFILE").or_else(|| std::env::var_os("HOME")) {
        dirs.push(PathBuf::from(home).join(".local/bin"));
    }
    if let Some(appdata) = std::env::var_os("APPDATA") {
        dirs.push(PathBuf::from(appdata).join("npm"));
    }
    if let Some(paths) = std::env::var_os("PATH") {
        dirs.extend(std::env::split_paths(&paths));
    }
    let name = match agent {
        Agent::Codex => "codex",
        Agent::Claude => "claude",
    };
    let mut result = Vec::new();
    for dir in dirs {
        if !dir.is_absolute() {
            continue;
        }
        let Ok(dir) = dir.canonicalize() else {
            continue;
        };
        // Never discover executables from repository/dependency directories or
        // relative PATH entries. npm global shims are located, never executed.
        if dir
            .ancestors()
            .any(|p| p.join(".git").exists() || p.join("CLAUDE.md").exists())
        {
            continue;
        }
        #[cfg(windows)]
        {
            result.push((dir.join(format!("{name}.exe")), vec![]));
            if agent == Agent::Codex {
                let target = if cfg!(target_arch = "aarch64") {
                    "aarch64"
                } else {
                    "x86_64"
                };
                let suffix = if cfg!(target_arch = "aarch64") {
                    "arm64"
                } else {
                    "x64"
                };
                for base in [
                    dir.join("node_modules/@openai/codex"),
                    dir.join(format!("node_modules/@openai/codex-win32-{suffix}")),
                    dir.join(format!(
                        "node_modules/@openai/codex/node_modules/@openai/codex-win32-{suffix}"
                    )),
                ] {
                    for leaf in ["bin/codex.exe", "codex/codex.exe"] {
                        result.push((
                            base.join(format!("vendor/{target}-pc-windows-msvc/{leaf}")),
                            vec![],
                        ));
                    }
                }
            } else if dir.join("node.exe").is_file()
                && dir
                    .join("node_modules/@anthropic-ai/claude-code/cli.js")
                    .is_file()
            {
                result.push((
                    dir.join("node.exe"),
                    vec![script_path(
                        &dir.join("node_modules/@anthropic-ai/claude-code/cli.js"),
                    )],
                ));
            }
        }
        #[cfg(not(windows))]
        result.push((dir.join(name), vec![]));
    }
    result
}
pub fn detect(agent: Agent) -> Result<Installation, String> {
    isolation_policy(agent)?;
    let mut last_error = None;
    for (exe, prefix) in installed_candidates(agent) {
        if !exe.is_file() {
            continue;
        }
        let Ok(exe) = exe.canonicalize() else {
            continue;
        };
        if exe
            .ancestors()
            .any(|p| p.join(".git").exists() || p.join("CLAUDE.md").exists())
        {
            continue;
        }
        match qualify(&exe, &prefix, agent) {
            Ok((version, model)) => {
                let identity = launcher_stamp(&exe, &prefix)?;
                return Ok(Installation {
                    agent,
                    executable: exe,
                    prefix,
                    version,
                    model,
                    identity,
                });
            }
            Err(error) => last_error = Some(error),
        }
    }
    Err(last_error.unwrap_or_else(|| {
        "Not detected; install and authenticate the tool yourself, then restart the application"
            .into()
    }))
}
fn switch_disabled(bytes: &[u8], name: &str) -> bool {
    let Ok(text) = std::str::from_utf8(bytes) else {
        return false;
    };
    text.lines().any(|line| {
        let words: Vec<_> = line.split_whitespace().collect();
        words.first() == Some(&name) && words.last() == Some(&"false")
    })
}
#[cfg(test)]
fn switches_disabled(bytes: &[u8]) -> bool {
    CODEX_DISABLED
        .iter()
        .all(|name| switch_disabled(bytes, name))
}

fn executable_stamp(path: &Path) -> Result<String, String> {
    let meta = path
        .metadata()
        .map_err(|_| "Agent executable unavailable")?;
    Ok(format!(
        "{}:{}:{:?}",
        path.display(),
        meta.len(),
        meta.modified().map_err(|_| "Agent identity unavailable")?
    ))
}
fn launcher_stamp(exe: &Path, prefix: &[String]) -> Result<String, String> {
    let mut value = executable_stamp(exe)?;
    for file in prefix {
        value.push_str(&executable_stamp(Path::new(file))?);
    }
    Ok(value)
}
#[cfg(windows)]
fn script_path(path: &Path) -> String {
    let value = path.to_string_lossy();
    if let Some(rest) = value.strip_prefix(r"\\?\UNC\") {
        format!(r"\\{rest}")
    } else {
        value.trim_start_matches(r"\\?\").to_owned()
    }
}

fn isolation_policy(agent: Agent) -> Result<(), String> {
    let mut roots: Vec<PathBuf> = Vec::new();
    #[cfg(windows)]
    {
        // Inspect existence only, never contents/credentials. System config is
        // NOT skipped by ignore-user-config / safe-mode. Do not merge an empty
        // MCP table and assume it erased inherited administrator servers.
        for base in [
            std::env::var_os("ProgramData").map(PathBuf::from),
            Some(PathBuf::from(r"C:\ProgramData")),
        ]
        .into_iter()
        .flatten()
        {
            if agent == Agent::Codex {
                roots.push(base.join("OpenAI/Codex"));
            }
        }
        if agent == Agent::Claude {
            for base in [
                std::env::var_os("ProgramFiles").map(PathBuf::from),
                Some(PathBuf::from(r"C:\Program Files")),
            ]
            .into_iter()
            .flatten()
            {
                roots.push(base.join("ClaudeCode"));
            }
        }
    }
    #[cfg(unix)]
    {
        roots.push(PathBuf::from(if agent == Agent::Codex {
            "/etc/codex"
        } else {
            "/etc/claude-code"
        }));
        #[cfg(target_os = "macos")]
        if agent == Agent::Claude {
            roots.push(PathBuf::from("/Library/Application Support/ClaudeCode"));
        }
    }
    let files: &[&str] = if agent == Agent::Codex {
        &["config.toml", "requirements.toml", "managed_config.toml"]
    } else {
        &[
            "managed-settings.json",
            "managed-settings.d",
            "managed-mcp.json",
        ]
    };
    if roots
        .iter()
        .any(|root| files.iter().any(|file| root.join(file).exists()))
    {
        return Err("Managed/system customizations detected; this installation needs isolation qualification before explanations can run".into());
    }
    // This empty cwd must not inherit a project configuration from its parents.
    let home = std::env::var_os("USERPROFILE")
        .or_else(|| std::env::var_os("HOME"))
        .and_then(|p| PathBuf::from(p).canonicalize().ok());
    if std::env::temp_dir().ancestors().any(|p| {
        let is_user_home = home
            .as_ref()
            .is_some_and(|home| p.canonicalize().as_ref().is_ok_and(|p| p == home));
        (!is_user_home
            && (p.join(".codex/config.toml").exists() || p.join(".claude/settings.json").exists()))
            || p.join(".git").exists()
    }) {
        return Err("Temporary-directory ancestors contain project customizations; isolated explanation unavailable".into());
    }
    Ok(())
}

const CODEX_DISABLED: &[&str] = &[
    "shell_tool",
    "shell_snapshot",
    "view_image",
    "multi_agent",
    "multi_agent_v2",
    "hooks",
    "memories",
    "apps",
    "plugins",
    "remote_plugin",
    "skill_search",
    "skill_mcp_dependency_install",
    "tool_suggest",
    "browser_use",
    "browser_use_external",
    "computer_use",
    "in_app_browser",
    "image_generation",
    "code_mode",
    "code_mode_host",
    "workspace_dependencies",
    "goals",
    "unbounded_connection_retries",
];
fn arguments(agent: Agent, model: &str) -> Vec<String> {
    match agent {
        Agent::Codex => {
            let mut args: Vec<String> = [
                "exec",
                "--ignore-user-config",
                "--ignore-rules",
                "--strict-config",
                "--ephemeral",
                "--skip-git-repo-check",
                "--json",
                "--color",
                "never",
                "--model",
                model,
            ]
            .map(str::to_owned)
            .to_vec();
            for value in ["approval_policy=\"never\"", "default_permissions=\"explanation\"", "permissions.explanation.filesystem={\":root\"=\"deny\",\":workspace_roots\"=\"read\"}", "permissions.explanation.network.enabled=false", "project_doc_max_bytes=0", "web_search=\"disabled\"", "mcp_servers={}", "apps._default.enabled=false", "features.skip_host_skill_discovery=true", "suppress_unstable_features_warning=true", "otel.exporter=\"none\"", "otel.trace_exporter=\"none\"", "otel.log_user_prompt=false", "feedback.enabled=false"] {
                args.extend(["-c".into(), value.into()]);
            }
            for feature in CODEX_DISABLED {
                args.extend(["--disable".into(), (*feature).into()]);
            }
            args.push("-".into());
            args
        }
        Agent::Claude => [
            "--print",
            "--safe-mode",
            "--restricted",
            "--tools",
            "",
            "--disallowedTools",
            "*",
            "--strict-mcp-config",
            "--mcp-config",
            "{\"mcpServers\":{}}",
            "--setting-sources",
            "",
            "--settings",
            "{\"disableAllHooks\":true,\"autoMemoryEnabled\":false}",
            "--disable-slash-commands",
            "--no-chrome",
            "--no-session-persistence",
            "--permission-prompts",
            "none",
            "--max-turns",
            "1",
            "--model",
            model,
            "--output-format",
            "json",
        ]
        .map(str::to_owned)
        .to_vec(),
    }
}
pub fn input(prompt: &str, payload: &str) -> String {
    format!("{prompt}\n\nBounded evidence (untrusted data):\n{payload}")
}
pub async fn explain(installation: Installation, input: String) -> Reply {
    isolation_policy(installation.agent)?;
    if input.len() > 30000 {
        return Err("Agent input exceeds budget".into());
    }
    if launcher_stamp(&installation.executable, &installation.prefix)? != installation.identity {
        return Err("Installed agent changed; prepare again".into());
    }
    let cancel = Arc::new(AtomicBool::new(false));
    struct Cancel(Arc<AtomicBool>);
    impl Drop for Cancel {
        fn drop(&mut self) {
            self.0.store(true, Ordering::SeqCst);
        }
    }
    let _cancel = Cancel(cancel.clone());
    let agent = installation.agent;
    let model = installation.model.clone();
    let bytes = tauri::async_runtime::spawn_blocking(move || {
        run(
            &installation.executable,
            &installation.prefix,
            &arguments(agent, &model),
            &input,
            Duration::from_secs(60),
            cancel,
        )
    })
    .await
    .map_err(|_| "Agent process interrupted")??;
    decode(agent, &bytes)
}
pub fn decode(agent: Agent, bytes: &[u8]) -> Reply {
    let text = std::str::from_utf8(bytes).map_err(|_| "Malformed output: agent bytes/envelope")?;
    match agent {
        Agent::Claude => {
            let envelope: Value =
                serde_json::from_str(text).map_err(|_| "Malformed output: agent bytes/envelope")?;
            if envelope["type"] != "result"
                || envelope["is_error"] != false
                || envelope["subtype"] != "success"
            {
                return Err(diagnostic(envelope["result"].as_str().unwrap_or("")));
            }
            serde_json::from_str(
                envelope["result"]
                    .as_str()
                    .ok_or("Malformed output: agent answer envelope")?,
            )
            .map_err(|_| "Malformed output: agent answer was not JSON".into())
        }
        Agent::Codex => {
            let mut answer = None;
            let mut complete = false;
            for line in text.lines().filter(|s| !s.trim().is_empty()) {
                let event: Value = serde_json::from_str(line)
                    .map_err(|_| "Malformed output: agent JSONL event")?;
                if event["type"] == "error" || event["type"] == "turn.failed" {
                    return Err(diagnostic(
                        event["message"]
                            .as_str()
                            .or_else(|| event["error"]["message"].as_str())
                            .unwrap_or(""),
                    ));
                }
                if event["type"] == "turn.completed" {
                    complete = true;
                }
                if event["type"] == "item.started"
                    || event["type"] == "item.completed"
                    || event["type"] == "item.updated"
                {
                    match event["item"]["type"].as_str() {
                        Some("agent_message") if event["type"] == "item.completed" => {
                            answer = Some(
                                serde_json::from_str(
                                    event["item"]["text"]
                                        .as_str()
                                        .ok_or("Malformed output: agent answer envelope")?,
                                )
                                .map_err(|_| "Malformed output: agent answer was not JSON")?,
                            );
                        }
                        Some("reasoning") | Some("agent_message") => (),
                        Some("error") => {
                            let message = event["item"]["message"].as_str().unwrap_or("");
                            // Nonfatal catalog notices are not tool executions. Missing
                            // metadata does not relax the independently qualified controls.
                            if message.starts_with("Model metadata for `")
                                && message.contains("Defaulting to fallback metadata")
                            {
                                continue;
                            }
                            if message.starts_with(
                                "Code Mode is unavailable because code-mode host is disabled.",
                            ) && message.contains("Code mode will fail closed;")
                            {
                                continue;
                            }
                            return Err(diagnostic(message));
                        }
                        _ => {
                            let kind = event["item"]["type"]
                                .as_str()
                                .filter(|s| {
                                    s.len() <= 80
                                        && s.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'_')
                                })
                                .unwrap_or("unknown");
                            return Err(format!(
                                "Unsupported agent operation: {kind}; explanation rejected"
                            ));
                        }
                    }
                }
            }
            if !complete {
                return Err("Malformed output: incomplete agent turn".into());
            }
            answer.ok_or("Malformed output: agent supplied no explanation".into())
        }
    }
}

static NEXT: AtomicU64 = AtomicU64::new(1);
struct Scratch(PathBuf);
impl Scratch {
    fn new() -> Result<Self, String> {
        let path = std::env::temp_dir().join(format!(
            "cbi-explanation-{}-{}",
            std::process::id(),
            NEXT.fetch_add(1, Ordering::Relaxed)
        ));
        if !path.is_absolute() {
            return Err("Agent temporary directory must be absolute".into());
        }
        #[cfg(unix)]
        {
            use std::os::unix::fs::DirBuilderExt;
            std::fs::DirBuilder::new()
                .mode(0o700)
                .create(&path)
                .map_err(|_| "Cannot create isolated agent working directory")?;
        }
        #[cfg(not(unix))]
        std::fs::create_dir(&path).map_err(|_| "Cannot create isolated agent working directory")?;
        Ok(Self(path))
    }
}
impl Drop for Scratch {
    fn drop(&mut self) {
        // Only the absolute directory created by this instance. Rust does not
        // follow directory symlinks while removing its contents.
        let _ = std::fs::remove_dir_all(&self.0);
    }
}
fn minimize_environment(command: &mut Command) {
    command.env_clear();
    for key in [
        "SystemRoot",
        "WINDIR",
        "USERPROFILE",
        "HOME",
        "APPDATA",
        "LOCALAPPDATA",
        "TEMP",
        "TMP",
        "CODEX_HOME",
        "CLAUDE_CONFIG_DIR",
    ] {
        if let Some(value) = std::env::var_os(key) {
            if Path::new(&value).is_absolute() {
                command.env(key, value);
            }
        }
    }
    command.env("NO_COLOR", "1");
    command.env("DISABLE_AUTOUPDATER", "1");
    command.env("CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC", "1");
}
fn capture(
    mut pipe: impl Read + Send + 'static,
    limit: usize,
    overflow: Arc<AtomicBool>,
) -> std::thread::JoinHandle<Vec<u8>> {
    std::thread::spawn(move || {
        let mut bytes = Vec::new();
        let mut chunk = [0u8; 4096];
        loop {
            match pipe.read(&mut chunk) {
                Ok(0) | Err(_) => break,
                Ok(n) => {
                    if bytes.len() + n > limit {
                        overflow.store(true, Ordering::SeqCst);
                        break;
                    }
                    bytes.extend_from_slice(&chunk[..n]);
                }
            }
        }
        bytes
    })
}
fn run(
    exe: &Path,
    prefix: &[String],
    args: &[String],
    input: &str,
    timeout: Duration,
    cancel: Arc<AtomicBool>,
) -> Result<Vec<u8>, String> {
    let output = run_output(exe, prefix, args, input, timeout, cancel, 64000)?;
    if output.code != Some(0) {
        return Err(process_failure(&output));
    }
    Ok(output.stdout)
}
struct ProcessOutput {
    code: Option<i32>,
    stdout: Vec<u8>,
    stderr: Vec<u8>,
}
fn diagnostic(message: &str) -> String {
    let lower = message.to_ascii_lowercase();
    for marker in [
        "unknown configuration field `",
        "unexpected argument '",
        "unknown option '",
        "unrecognized option '",
    ] {
        if let Some(rest) = lower.split_once(marker).map(|(_, r)| r) {
            let name: String = rest
                .chars()
                .take_while(|c| c.is_ascii_alphanumeric() || "-_.".contains(*c))
                .take(100)
                .collect();
            if !name.is_empty() {
                return format!("Unsupported capability/configuration: {name}");
            }
        }
    }
    if lower.contains("config.toml")
        || lower.contains("default_permissions")
        || lower.contains("permissions profile")
        || lower.contains("invalid configuration")
    {
        return "Unsupported capability/configuration: secure CLI startup rejected its configuration".into();
    }
    if lower.contains("not supported") && lower.contains("model")
        || lower.contains("model_not_found")
    {
        return "Model unavailable for this account; the installed catalog model was rejected"
            .into();
    }
    if lower.contains("401")
        || lower.contains("not logged in")
        || lower.contains("authentication")
        || lower.contains("token expired")
        || lower.contains("unauthorized")
        || lower.contains("please log in")
    {
        return "Authentication failed; check the installed agent login outside the application"
            .into();
    }
    if lower.contains("429") || lower.contains("quota") || lower.contains("rate limit") {
        return "Provider quota/rate limit reached".into();
    }
    if lower.contains("connection")
        || lower.contains("network")
        || lower.contains("dns")
        || lower.contains("timed out")
    {
        return "Provider connectivity failed".into();
    }
    "Agent process failed; no recognized safe diagnostic (raw output withheld)".into()
}
fn process_failure(output: &ProcessOutput) -> String {
    let stderr = String::from_utf8_lossy(&output.stderr);
    let mut detail = diagnostic(&stderr);
    for line in String::from_utf8_lossy(&output.stdout).lines() {
        if let Ok(event) = serde_json::from_str::<Value>(line) {
            if event["type"] == "error"
                || event["type"] == "turn.failed"
                || event["is_error"] == true
            {
                let message = event["message"]
                    .as_str()
                    .or_else(|| event["error"]["message"].as_str())
                    .or_else(|| event["result"].as_str())
                    .unwrap_or("");
                detail = diagnostic(message);
            }
        }
    }
    format!(
        "{detail} (exit {})",
        output
            .code
            .map(|c| c.to_string())
            .unwrap_or_else(|| "signal".into())
    )
}
fn run_output(
    exe: &Path,
    prefix: &[String],
    args: &[String],
    input: &str,
    timeout: Duration,
    cancel: Arc<AtomicBool>,
    stdout_limit: usize,
) -> Result<ProcessOutput, String> {
    if cancel.load(Ordering::SeqCst) {
        return Err("Agent explanation cancelled".into());
    }
    if input.len() > 30000 {
        return Err("Agent input exceeds budget".into());
    }
    let scratch = Scratch::new()?;
    let mut command = Command::new(exe);
    command
        .args(prefix)
        .args(args)
        .current_dir(&scratch.0)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    minimize_environment(&mut command);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x08000000);
    }
    #[cfg(unix)]
    {
        use std::os::unix::process::CommandExt;
        command.process_group(0);
    }
    let child = command.spawn().map_err(|e| {
        format!(
            "Process start failed (OS error {})",
            e.raw_os_error()
                .map(|n| n.to_string())
                .unwrap_or_else(|| "unknown".into())
        )
    })?;
    let mut child = Supervised::new(child)?;
    let overflow = Arc::new(AtomicBool::new(false));
    let out = capture(
        child
            .child
            .stdout
            .take()
            .ok_or("Agent stdout unavailable")?,
        stdout_limit,
        overflow.clone(),
    );
    let err = capture(
        child
            .child
            .stderr
            .take()
            .ok_or("Agent stderr unavailable")?,
        16000,
        overflow.clone(),
    );
    let mut stdin = child.child.stdin.take().ok_or("Agent stdin unavailable")?;
    let input = input.as_bytes().to_vec();
    let writer = std::thread::spawn(move || stdin.write_all(&input));
    let start = Instant::now();
    let result: Result<Option<i32>, String> = loop {
        if cancel.load(Ordering::SeqCst) {
            break Err("Agent explanation cancelled".into());
        }
        if overflow.load(Ordering::SeqCst) {
            break Err("Agent output exceeds budget".into());
        }
        if start.elapsed() >= timeout {
            break Err("Agent explanation timed out".into());
        }
        match child.child.try_wait() {
            Ok(Some(status)) => {
                break Ok(status.code());
            }
            Err(_) => break Err("Agent process supervision failed".into()),
            Ok(None) => std::thread::sleep(Duration::from_millis(10)),
        }
    };
    drop(child); // Close the job / kill the group BEFORE joining any pipe readers.
    let output = out.join().map_err(|_| "Agent output interrupted")?;
    let stderr = err.join().map_err(|_| "Agent diagnostics interrupted")?; // Private; classify, never log raw.
    let _ = writer.join();
    let code = result?;
    if overflow.load(Ordering::SeqCst) {
        return Err("Agent output exceeds budget".into());
    }
    Ok(ProcessOutput {
        code,
        stdout: output,
        stderr,
    })
}

struct Supervised {
    child: Child,
    #[cfg(windows)]
    job: isize,
}
impl Supervised {
    fn new(mut child: Child) -> Result<Self, String> {
        #[cfg(windows)]
        {
            use std::os::windows::io::AsRawHandle;
            // Kill-on-close is mandatory, including descendants. The approved
            // stdin is not written until successful job assignment.
            let job = unsafe { CreateJobObjectW(std::ptr::null(), std::ptr::null()) };
            let mut info = JobInfo::default();
            info.basic.limit_flags = 0x2000;
            if job == 0
                || unsafe {
                    SetInformationJobObject(
                        job,
                        9,
                        &info as *const _ as *const _,
                        std::mem::size_of::<JobInfo>() as u32,
                    )
                } == 0
                || unsafe { AssignProcessToJobObject(job, child.as_raw_handle() as isize) } == 0
            {
                let _ = child.kill();
                let _ = child.wait();
                if job != 0 {
                    unsafe {
                        CloseHandle(job);
                    }
                }
                return Err("Agent process-tree containment unavailable".into());
            }
            Ok(Self { child, job })
        }
        #[cfg(not(windows))]
        {
            let _ = &mut child;
            Ok(Self { child })
        }
    }
}
impl Drop for Supervised {
    fn drop(&mut self) {
        #[cfg(windows)]
        unsafe {
            CloseHandle(self.job);
        }
        #[cfg(unix)]
        unsafe {
            kill(-(self.child.id() as i32), 9);
        }
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}
#[cfg(unix)]
unsafe extern "C" {
    fn kill(pid: i32, signal: i32) -> i32;
}
#[cfg(windows)]
#[repr(C)]
#[derive(Default)]
struct BasicLimits {
    process_time: i64,
    job_time: i64,
    limit_flags: u32,
    min_working: usize,
    max_working: usize,
    active_limit: u32,
    affinity: usize,
    priority: u32,
    scheduling: u32,
}
#[cfg(windows)]
#[repr(C)]
#[derive(Default)]
struct JobInfo {
    basic: BasicLimits,
    io: [u64; 6],
    process_memory: usize,
    job_memory: usize,
    peak_process: usize,
    peak_job: usize,
}
#[cfg(windows)]
#[link(name = "kernel32")]
unsafe extern "system" {
    fn CreateJobObjectW(attributes: *const std::ffi::c_void, name: *const u16) -> isize;
    fn SetInformationJobObject(
        job: isize,
        class: u32,
        info: *const std::ffi::c_void,
        size: u32,
    ) -> i32;
    fn AssignProcessToJobObject(job: isize, process: isize) -> i32;
    fn CloseHandle(handle: isize) -> i32;
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    use std::sync::OnceLock;
    fn fixture() -> &'static Path {
        static EXE: OnceLock<PathBuf> = OnceLock::new();
        EXE.get_or_init(|| {
            let dir = Scratch::new().unwrap();
            let exe = dir.0.join(if cfg!(windows) {
                "agent-fixture.exe"
            } else {
                "agent-fixture"
            });
            let source = Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/agent_fixture.rs");
            assert!(Command::new("rustc")
                .arg(source)
                .arg("-o")
                .arg(&exe)
                .status()
                .unwrap()
                .success());
            // Retained solely for parallel subprocess tests, never shipped.
            std::mem::forget(dir);
            exe
        })
        .as_path()
    }
    #[test]
    fn qualified_detection_rejects_unknown_cli_and_forced_access_features() {
        assert_eq!(
            version_label(b"codex-cli 99.1.2\n").unwrap(),
            "codex-cli 99.1.2"
        );
        assert!(version_label(b"\n").is_err());
        assert!(version_label(b"fake\nmalicious").is_err());
        let help = CODEX_OPTIONS.join(" ");
        assert!(missing_options(Agent::Codex, &help).is_empty());
        assert_eq!(
            missing_options(Agent::Codex, &help.replace("--ignore-rules", "")),
            vec!["--ignore-rules"]
        );
        let all = CODEX_DISABLED
            .iter()
            .map(|s| format!("{s} stable false"))
            .collect::<Vec<_>>()
            .join("\n");
        assert!(switches_disabled(all.as_bytes()));
        assert!(!switches_disabled(
            all.replace("shell_tool stable false", "shell_tool stable true")
                .as_bytes()
        ));
        assert!(run(
            Path::new("/nonexistent/allowlisted-agent"),
            &[],
            &[],
            "",
            Duration::from_secs(1),
            Arc::new(AtomicBool::new(false))
        )
        .is_err());
    }
    #[test]
    fn future_versions_qualify_by_real_probes_and_missing_controls_fail_closed() {
        for agent in [Agent::Codex, Agent::Claude] {
            let (version, model) = qualify(fixture(), &[], agent).unwrap();
            assert_eq!(version, "fixture-cli 99.1.2");
            assert_eq!(
                model,
                if agent == Agent::Codex {
                    "fixture-model"
                } else {
                    "sonnet"
                }
            );
        }
        let missing = qualify(
            fixture(),
            &["--fixture-mode=missing-security".into()],
            Agent::Codex,
        )
        .unwrap_err();
        assert!(missing.contains("--ignore-rules"));
        assert!(qualify(
            fixture(),
            &["--fixture-mode=forced-feature".into()],
            Agent::Codex
        )
        .unwrap_err()
        .contains("shell_tool"));
        assert!(qualify(
            fixture(),
            &["--fixture-mode=invalid-config".into()],
            Agent::Codex
        )
        .unwrap_err()
        .contains("permissions.explanation"));
    }
    #[test]
    fn both_real_process_adapters_accept_only_bounded_context_in_empty_cwd() {
        for agent in [Agent::Codex, Agent::Claude] {
            let context = input(
                "No tools. Cite evidence.",
                r#"{"files":[{"id":"F1","path":"entry.ts"}]}"#,
            );
            let bytes = run(
                fixture(),
                &[],
                &arguments(agent, "fixture-model"),
                &context,
                Duration::from_secs(5),
                Arc::new(AtomicBool::new(false)),
            )
            .unwrap();
            assert_eq!(
                decode(agent, &bytes).unwrap(),
                json!({"body":"Generated [F1]","citations":["F1"]})
            );
        }
    }
    #[test]
    fn malformed_incomplete_error_and_tool_output_are_rejected() {
        let warning=br#"{"type":"item.completed","item":{"type":"error","message":"Model metadata for `catalog-model` not found. Defaulting to fallback metadata; this can degrade performance and cause issues."}}
{"type":"item.completed","item":{"type":"agent_message","text":"{\"body\":\"Generated [F1]\",\"citations\":[\"F1\"]}"}}
{"type":"turn.completed"}"#;
        assert!(decode(Agent::Codex, warning).is_ok());
        let disabled_notice=String::from_utf8_lossy(warning).replace("Model metadata for `catalog-model` not found. Defaulting to fallback metadata; this can degrade performance and cause issues.","Code Mode is unavailable because code-mode host is disabled. Code mode will fail closed; enable `features.code_mode_host` and install `codex-code-mode-host`.");
        assert!(decode(Agent::Codex, disabled_notice.as_bytes()).is_ok());
        assert!(decode(
            Agent::Codex,
            disabled_notice
                .replace("Code mode will fail closed;", "Unrecognized warning;")
                .as_bytes()
        )
        .is_err());

        assert!(decode(
            Agent::Codex,
            br#"{"type":"item.completed","item":{"type":"error","message":"401 unauthorized"}}"#
        )
        .unwrap_err()
        .contains("Authentication failed"));
        assert!(decode(Agent::Claude, b"not-json").is_err());
        assert!(decode(Agent::Codex, b"not-json").is_err());
        assert!(decode(Agent::Codex, b"{\"type\":\"turn.failed\"}").is_err());
        assert!(decode(Agent::Codex,b"{\"type\":\"item.completed\",\"item\":{\"type\":\"command_execution\"}}\n{\"type\":\"turn.completed\"}").is_err());
        assert!(decode(Agent::Codex, b"{\"type\":\"thread.started\"}").is_err());
        assert!(decode(
            Agent::Claude,
            b"{\"type\":\"result\",\"is_error\":true,\"subtype\":\"error\"}"
        )
        .is_err());
    }
    #[test]
    fn bounded_pipes_and_timeout_terminate_real_processes() {
        for mode in ["overflow", "stderr-overflow", "timeout"] {
            let start = Instant::now();
            assert!(run(
                fixture(),
                &[format!("--fixture-mode={mode}")],
                &[],
                "",
                Duration::from_millis(150),
                Arc::new(AtomicBool::new(false))
            )
            .is_err());
            assert!(start.elapsed() < Duration::from_secs(5));
        }
    }
    #[test]
    fn cancellation_and_timeout_clean_up_descendants() {
        for cancelled in [false, true] {
            let scratch = Scratch::new().unwrap();
            let file = scratch.0.join("pid");
            let cancel = Arc::new(AtomicBool::new(false));
            let flag = cancel.clone();
            let pid_file = file.clone();
            let runner = std::thread::spawn(move || {
                run(
                    fixture(),
                    &[
                        "--fixture-mode=tree".into(),
                        format!("--pid-file={}", pid_file.display()),
                    ],
                    &[],
                    "",
                    Duration::from_secs(2),
                    flag,
                )
            });
            let start = Instant::now();
            while !file.is_file() && start.elapsed() < Duration::from_secs(5) {
                std::thread::sleep(Duration::from_millis(10));
            }
            let pid: u32 = std::fs::read_to_string(&file).unwrap().parse().unwrap();
            if cancelled {
                cancel.store(true, Ordering::SeqCst);
            }
            let result = runner.join().unwrap().unwrap_err();
            assert!(result.contains(if cancelled { "cancelled" } else { "timed out" }));
            #[cfg(windows)]
            unsafe {
                let process = OpenProcess(0x100000, 0, pid); // SYNCHRONIZE only, no write authority.
                if process != 0 {
                    assert_eq!(WaitForSingleObject(process, 2000), 0);
                    CloseHandle(process);
                }
            }
            std::fs::remove_file(&file).unwrap();
        }
    }
    #[test]
    fn stale_executable_never_runs_and_async_abort_cancels_the_worker() {
        let installation = Installation {
            agent: Agent::Codex,
            executable: fixture().to_path_buf(),
            prefix: vec![],
            version: "test".into(),
            model: "fixture-model".into(),
            identity: "stale".into(),
        };
        assert!(
            tauri::async_runtime::block_on(explain(installation, input("Prompt", "{}")))
                .unwrap_err()
                .contains("changed")
        );
        let timeout_exe = fixture().parent().unwrap().join(if cfg!(windows) {
            "timeout-agent.exe"
        } else {
            "timeout-agent"
        });
        std::fs::copy(fixture(), &timeout_exe).unwrap();
        let installation = Installation {
            agent: Agent::Claude,
            executable: timeout_exe.clone(),
            prefix: vec![],
            version: "test".into(),
            model: "fixture-model".into(),
            identity: executable_stamp(&timeout_exe).unwrap(),
        };
        let task = tauri::async_runtime::spawn(explain(installation, input("Prompt", "{}")));
        std::thread::sleep(Duration::from_millis(100));
        task.abort();
        assert!(tauri::async_runtime::block_on(task).is_err());
        let started = Instant::now();
        while std::fs::remove_file(&timeout_exe).is_err() {
            assert!(
                started.elapsed() < Duration::from_secs(2),
                "Aborted process still owns its executable"
            );
            std::thread::sleep(Duration::from_millis(10));
        }
    }
    #[test]
    fn report_installed_agent_status_without_authentication_or_network_request() {
        for agent in [Agent::Codex, Agent::Claude] {
            match detect(agent) {
                Ok(i) => println!("{} available: {}", agent.id(), i.version),
                Err(e) => println!("{}: {}", agent.id(), e),
            }
        }
    }
    #[test]
    #[ignore = "Explicit user-authorized synthetic live account test; never runs in offline suite"]
    fn live_codex_synthetic_explanation() {
        let installed = detect(Agent::Codex).expect("Actual installed Codex must qualify");
        println!(
            "Qualified installed version: {}; model: {}",
            installed.version, installed.model
        );
        let context=input("Explain only supplied structural metadata. No tools. Return JSON with exactly body (plain text, cite [F1]) and citations (array containing F1). Do not invent structure.", r#"{"files":[{"id":"F1","path":"entry.ts","exports":["entry"]}],"relationships":[],"coverage":{"omissions":["Synthetic metadata only; no implementation supplied"]}}"#);
        let answer = tauri::async_runtime::block_on(explain(installed, context))
            .expect("Live bounded Codex explanation");
        assert!(answer["body"].as_str().is_some_and(|s| s.contains("[F1]")));
        assert_eq!(answer["citations"], json!(["F1"]));
        println!("PASS: live synthetic cited JSON explanation; no repository context supplied");
    }
    #[test]
    fn capability_models_and_private_failures_are_bounded_and_specific() {
        assert_eq!(model_from_catalog(br#"{"models":[{"slug":"retired","visibility":"hide","priority":0},{"slug":"compatible-next","visibility":"list","priority":1}]}"#).unwrap(),"compatible-next");
        assert!(
            model_from_catalog(br#"{"models":[{"slug":"../private","visibility":"list"}]}"#)
                .is_err()
        );
        assert!(diagnostic(
            "Error loading config.toml: unknown configuration field `tools.view_image`"
        )
        .contains("tools.view_image"));
        assert!(
            diagnostic("The model is not supported with a ChatGPT account")
                .starts_with("Model unavailable")
        );
        assert!(diagnostic("401 Unauthorized sk-sensitive").starts_with("Authentication failed"));
        let error = process_failure(&ProcessOutput {
            code: Some(7),
            stdout: vec![],
            stderr: b"secret sk-hidden /private source prompt".to_vec(),
        });
        assert!(error.contains("exit 7"));
        assert!(!error.contains("sk-hidden"));
        assert!(!error.contains("source prompt"));
        assert!(empty_input_validated(
            Agent::Codex,
            &ProcessOutput {
                code: Some(1),
                stdout: vec![],
                stderr: b"No prompt provided via stdin.\n".to_vec()
            }
        ));
        assert!(!empty_input_validated(
            Agent::Codex,
            &ProcessOutput {
                code: Some(1),
                stdout: vec![],
                stderr: b"unknown configuration field".to_vec()
            }
        ));
        let output = ProcessOutput {
            code: Some(1),
            stdout: br#"{"type":"turn.failed","error":{"message":"401 unauthorized"}}"#.to_vec(),
            stderr: vec![],
        };
        assert!(process_failure(&output).contains("Authentication failed"));
    }
    #[cfg(windows)]
    #[link(name = "kernel32")]
    unsafe extern "system" {
        fn OpenProcess(access: u32, inherit: i32, pid: u32) -> isize;
        fn WaitForSingleObject(handle: isize, millis: u32) -> u32;
    }
}
