#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod engine_process;
mod explanations;
use engine_process::{engine_command, storage_command, EngineDiagnostics};
use explanations::{
    cancel_explanation, prepare_explanation, provider_configuration, send_explanation, Explanations,
};

use serde::Serialize;
use serde_json::{json, Value};
use std::{
    collections::{HashMap, HashSet},
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicU64, Ordering},
        mpsc, Mutex,
    },
    time::Duration,
};
use tauri::{Emitter, Manager};
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_shell::{
    process::{CommandChild, CommandEvent},
    ShellExt,
};

const MAX_EVENT: usize = 32 * 1024 * 1024;
const MAX_REQUEST: usize = 16 * 1024;
static NEXT_ID: AtomicU64 = AtomicU64::new(1);
fn id() -> String {
    format!("native-{}", NEXT_ID.fetch_add(1, Ordering::Relaxed))
}
type Reply = Result<Value, String>;
#[derive(Default)]
struct Session {
    root: Option<PathBuf>,
    repository_id: String,
    job_id: Option<String>,
    running: bool,
    choosing: bool,
    opening: bool,
    closing: bool,
    storage_children: HashMap<String, CommandChild>,
    used_jobs: HashSet<String>,
    child: Option<CommandChild>,
    files: HashSet<String>,
    pending: HashMap<String, mpsc::Sender<Reply>>,
}
#[derive(Default)]
struct Engine(Mutex<Session>);
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Repository {
    repository_id: String,
    root: String,
}
fn valid_id(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 80
        && value
            .bytes()
            .all(|c| c.is_ascii_alphanumeric() || c == b'-' || c == b'_')
}
fn check_start(session: &Session, repository_id: &str, job_id: &str) -> Result<PathBuf, String> {
    if session.closing {
        return Err("Application is shutting down".into());
    }
    if !valid_id(job_id) || session.used_jobs.contains(job_id) || session.used_jobs.len() >= 10000 {
        return Err("Invalid, reused or exhausted job identity".into());
    }
    if repository_id != session.repository_id {
        return Err("Repository was not selected by the native picker".into());
    }
    if session.running || session.choosing || session.opening {
        return Err("An analysis or directory selection is already active".into());
    }
    session
        .root
        .clone()
        .ok_or("Select a repository first".into())
}
fn database_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_local_data_dir()
        .map_err(|_| "Local storage directory unavailable")?;
    std::fs::create_dir_all(&dir).map_err(|_| "Cannot create local application storage")?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(&dir, std::fs::Permissions::from_mode(0o700))
            .map_err(|_| "Cannot protect local application storage")?;
    }
    Ok(dir
        .canonicalize()
        .map_err(|_| "Local storage directory inaccessible")?
        .join("intelligence.sqlite"))
}
async fn storage_request(app: &tauri::AppHandle, request: Value, root: Option<&Path>) -> Reply {
    let resources = app
        .path()
        .resource_dir()
        .map_err(|_| "Engine resources unavailable")?
        .join("engine");
    let database = database_path(app)?;
    let command = storage_command(
        app.shell()
            .sidecar("code-engine")
            .map_err(|_| "Bundled Node runtime unavailable")?,
        &resources,
        &database,
        root,
    )?;
    let (mut events, mut child) = command
        .spawn()
        .map_err(|_| "Cannot start local storage engine")?;
    let frame = format!("{}\n", request);
    if frame.len() > MAX_REQUEST {
        let _ = child.kill();
        return Err("Storage request exceeds limits".into());
    }
    if child.write(frame.as_bytes()).is_err() {
        let _ = child.kill();
        return Err("Storage pipe unavailable".into());
    }
    let storage_id = id();
    {
        let engine = app.state::<Engine>();
        let mut session = engine.0.lock().map_err(|_| "Engine state unavailable")?;
        if session.closing || session.storage_children.len() >= 16 {
            let _ = child.kill();
            return Err("Storage is shutting down or has too many pending requests".into());
        }
        session.storage_children.insert(storage_id.clone(), child);
    }
    let (sender, receiver) = mpsc::channel();
    let reader = tauri::async_runtime::spawn(async move {
        let result = async {
            let mut diagnostics = EngineDiagnostics::default();
            while let Some(event) = events.recv().await {
                match event {
                    CommandEvent::Stdout(bytes) => {
                        if bytes.len() > MAX_EVENT {
                            return Err("Storage response exceeds limits".into());
                        }
                        let reply: Value = serde_json::from_slice(&bytes)
                            .map_err(|_| "Invalid storage response")?;
                        if reply["version"] != 1 {
                            return Err("Invalid storage version".into());
                        }
                        if reply["ok"] == true {
                            return Ok(reply["result"].clone());
                        }
                        return Err(reply["error"]
                            .as_str()
                            .filter(|s| s.len() <= 1024)
                            .unwrap_or("Local storage failed")
                            .to_owned());
                    }
                    CommandEvent::Stderr(bytes) => diagnostics.capture(&bytes),
                    CommandEvent::Terminated(status) => {
                        return Err(diagnostics.exited(status.code, status.signal))
                    }
                    CommandEvent::Error(error) => return Err(diagnostics.transport_error(&error)),
                    _ => {}
                }
            }
            Err("Local storage engine stopped".into())
        }
        .await;
        let _ = sender.send(result);
    });
    let reply = tauri::async_runtime::spawn_blocking(move || {
        receive_storage_reply(receiver, Duration::from_secs(30))
    })
    .await
    .unwrap_or_else(|_| Err("Local storage request failed".into()));
    reader.abort();
    if let Ok(mut session) = app.state::<Engine>().0.lock() {
        if let Some(child) = session.storage_children.remove(&storage_id) {
            let _ = child.kill();
        }
    }
    reply
}
fn receive_storage_reply(receiver: mpsc::Receiver<Reply>, deadline: Duration) -> Reply {
    match receiver.recv_timeout(deadline) {
        Ok(reply) => reply,
        Err(mpsc::RecvTimeoutError::Timeout) => {
            Err("Local storage request timed out; check repository/storage access and retry".into())
        }
        Err(mpsc::RecvTimeoutError::Disconnected) => {
            Err("Local storage response unavailable; retry".into())
        }
    }
}
fn relative_file(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 4096
        && !value.contains(['\\', ':', '\0'])
        && !value.starts_with('/')
        && value
            .split('/')
            .all(|part| !part.is_empty() && part != ".." && part != ".")
}
fn decode_event(bytes: &[u8], expected_job: &str) -> Result<Value, String> {
    if bytes.len() > MAX_EVENT {
        return Err("Engine message exceeded its budget".into());
    }
    let event: Value = serde_json::from_slice(bytes).map_err(|_| "Invalid engine message")?;
    let object = event.as_object().ok_or("Invalid engine envelope")?;
    if event["version"] != 1
        || event["jobId"].as_str() != Some(expected_job)
        || !event["requestId"].as_str().map(valid_id).unwrap_or(false)
    {
        return Err("Invalid engine identity/version".into());
    }
    let extra = match event["type"].as_str() {
        Some("progress")
            if matches!(
                event["stage"].as_str(),
                Some("select" | "parse" | "validate")
            ) =>
        {
            vec!["stage"]
        }
        Some("complete") if event["snapshot"].is_object() => vec!["snapshot"],
        Some("evidence") if event["evidence"].is_object() => vec!["evidence"],
        Some("query") if event["result"].is_object() => vec!["result"],
        Some("investigation") if event["result"].is_object() => vec!["result"],
        Some("explanation") if event["result"].is_object() => vec!["result"],
        Some("error")
            if event["code"]
                .as_str()
                .map(|s| s.len() <= 80)
                .unwrap_or(false)
                && event["message"]
                    .as_str()
                    .map(|s| s.len() <= 1024)
                    .unwrap_or(false) =>
        {
            vec!["code", "message"]
        }
        _ => return Err("Unsupported engine event".into()),
    };
    if object.keys().any(|key| {
        !["version", "requestId", "jobId", "type"].contains(&key.as_str())
            && !extra.contains(&key.as_str())
    }) {
        return Err("Unknown engine event field".into());
    }
    Ok(event)
}
fn stop(session: &mut Session) {
    session.job_id = None;
    session.running = false;
    session.files.clear();
    if let Some(child) = session.child.take() {
        let _ = child.kill();
    }
    for (_, sender) in session.pending.drain() {
        let _ = sender.send(Err("Engine stopped; retry analysis".into()));
    }
}
fn fail(app: &tauri::AppHandle, job: &str, code: &str, message: &str) {
    explanations::invalidate(app);
    let engine = app.state::<Engine>();
    let Ok(mut session) = engine.0.lock() else {
        return;
    };
    if session.job_id.as_deref() != Some(job) {
        return;
    }
    let owner_pid = session.child.as_ref().map(|child| child.pid());
    stop(&mut session);
    drop(session);
    let storage_app = app.clone();
    let storage_job = job.to_owned();
    tauri::async_runtime::spawn(async move {
        if let Some(owner_pid) = owner_pid {
            let _ = storage_request(
            &storage_app,
            json!({"version":1,"type":"finish","jobId":storage_job,"ownerPid":owner_pid,"state":"interrupted"}),
            None,
        )
        .await;
        }
    });
    let _ = app.emit_to("main", "engine-event", json!({"version":1,"requestId":job,"jobId":job,"type":"error","code":code,"message":message}));
}

#[tauri::command]
async fn select_repository(app: tauri::AppHandle) -> Result<Option<Value>, String> {
    explanations::invalidate(&app);
    let picker_app = app.clone();
    let picked =
        tauri::async_runtime::spawn_blocking(move || -> Result<Option<Repository>, String> {
            let app = picker_app;
            let engine = app.state::<Engine>();
            let mut session = engine.0.lock().map_err(|_| "Engine state unavailable")?;
            if session.running || session.choosing || session.opening {
                return Err("Cancel the active analysis before opening another repository".into());
            }
            session.choosing = true;
            // Do not hold the process-state lock while a dialog is open: shutdown
            // must still be able to kill the engine without waiting on the picker.
            drop(session);
            let selected = app
                .dialog()
                .file()
                .set_title("Open local repository")
                .blocking_pick_folder();
            let mut session = engine.0.lock().map_err(|_| "Engine state unavailable")?;
            session.choosing = false;
            let Some(selected) = selected else {
                return Ok(None);
            };
            let root = selected
                .into_path()
                .map_err(|_| "Unsupported directory selection")?
                .canonicalize()
                .map_err(|_| "Directory is inaccessible")?;
            if !root.is_dir() {
                return Err("Choose an accessible directory".into());
            }
            stop(&mut session);
            session.root = Some(root.clone());
            session.repository_id = id();
            session.opening = true;
            Ok(Some(Repository {
                repository_id: session.repository_id.clone(),
                root: root.to_string_lossy().into_owned(),
            }))
        })
        .await
        .map_err(|_| "Directory selection failed".to_string())??;
    let Some(picked) = picked else {
        return Ok(None);
    };
    let result = storage_request(
        &app,
        json!({"version":1,"type":"register"}),
        Some(Path::new(&picked.root)),
    )
    .await;
    let engine = app.state::<Engine>();
    let mut session = engine.0.lock().map_err(|_| "Engine state unavailable")?;
    session.opening = false;
    let repo = result?;
    let repository_id = repo["repositoryId"]
        .as_str()
        .filter(|s| valid_id(s))
        .ok_or("Invalid stored repository identity")?;
    let root = repo["root"]
        .as_str()
        .ok_or("Invalid stored repository root")?;
    if Path::new(root).canonicalize().ok() != Path::new(&picked.root).canonicalize().ok() {
        return Err("Stored root does not match native selection".into());
    }
    session.repository_id = repository_id.to_owned();
    session.root = Some(PathBuf::from(root));
    Ok(Some(repo))
}

#[tauri::command]
async fn list_repositories(app: tauri::AppHandle) -> Reply {
    storage_request(&app, json!({"version":1,"type":"list"}), None).await
}
#[tauri::command]
async fn open_repository(app: tauri::AppHandle, repository_id: String) -> Reply {
    explanations::invalidate(&app);
    if !valid_id(&repository_id) {
        return Err("Invalid repository identity".into());
    }
    {
        let engine = app.state::<Engine>();
        let mut session = engine.0.lock().map_err(|_| "Engine state unavailable")?;
        if session.running || session.choosing || session.opening {
            return Err("Finish the current operation first".into());
        }
        session.opening = true;
    }
    let result = storage_request(
        &app,
        json!({"version":1,"type":"lookup","repositoryId":repository_id}),
        None,
    )
    .await;
    let engine = app.state::<Engine>();
    let mut session = engine.0.lock().map_err(|_| "Engine state unavailable")?;
    session.opening = false;
    let repo = result?;
    let root = repo["root"]
        .as_str()
        .filter(|s| Path::new(s).is_absolute())
        .ok_or("Invalid stored repository root")?;
    if repo["repositoryId"] != repository_id {
        return Err("Invalid stored repository identity".into());
    }
    stop(&mut session);
    session.repository_id = repository_id;
    session.root = Some(PathBuf::from(root));
    Ok(repo)
}
#[tauri::command]
async fn forget_repository(app: tauri::AppHandle, repository_id: String) -> Reply {
    explanations::invalidate(&app);
    if !valid_id(&repository_id) {
        return Err("Invalid repository identity".into());
    }
    {
        let engine = app.state::<Engine>();
        let mut session = engine.0.lock().map_err(|_| "Engine state unavailable")?;
        if session.running || session.choosing || session.opening {
            return Err("Finish the current operation first".into());
        }
        session.opening = true;
    }
    let result = storage_request(
        &app,
        json!({"version":1,"type":"forget","repositoryId":repository_id}),
        None,
    )
    .await;
    let engine = app.state::<Engine>();
    let mut session = engine.0.lock().map_err(|_| "Engine state unavailable")?;
    session.opening = false;
    if result.is_ok() && session.repository_id == repository_id {
        stop(&mut session);
        session.root = None;
        session.repository_id.clear();
    }
    result
}
#[tauri::command]
async fn local_settings(
    app: tauri::AppHandle,
    theme: Option<String>,
    initial_theme: Option<String>,
) -> Reply {
    if initial_theme
        .as_ref()
        .is_some_and(|theme| !matches!(theme.as_str(), "system" | "dark" | "light"))
        || (theme.is_some() && initial_theme.is_some())
    {
        return Err("Invalid initial theme".into());
    }
    let request = match theme {
        Some(theme) if matches!(theme.as_str(), "system" | "dark" | "light") => {
            json!({"version":1,"type":"theme","theme":theme})
        }
        Some(_) => return Err("Invalid theme".into()),
        None => {
            if let Some(initial_theme) = initial_theme {
                json!({"version":1,"type":"settings","initialTheme":initial_theme})
            } else {
                json!({"version":1,"type":"settings"})
            }
        }
    };
    storage_request(&app, request, None).await
}

#[tauri::command]
async fn start_analysis(
    app: tauri::AppHandle,
    repository_id: String,
    job_id: String,
) -> Result<(), String> {
    launch_analysis(app, repository_id, job_id, false).await
}
#[tauri::command]
async fn reopen_analysis(
    app: tauri::AppHandle,
    repository_id: String,
    job_id: String,
) -> Result<(), String> {
    launch_analysis(app, repository_id, job_id, true).await
}
async fn launch_analysis(
    app: tauri::AppHandle,
    repository_id: String,
    job_id: String,
    reopen: bool,
) -> Result<(), String> {
    explanations::invalidate(&app);
    let database = database_path(&app)?;
    let engine = app.state::<Engine>();
    let mut session = engine.0.lock().map_err(|_| "Engine state unavailable")?;
    let root = check_start(&session, &repository_id, &job_id)?;
    session.used_jobs.insert(job_id.clone());
    stop(&mut session);
    let resources = app
        .path()
        .resource_dir()
        .map_err(|_| "Engine resources unavailable")?
        .join("engine");
    let command = engine_command(
        app.shell()
            .sidecar("code-engine")
            .map_err(|_| "Bundled Node runtime unavailable")?,
        &resources,
        &root,
    )?
    .env("CODE_INTELLIGENCE_DB", database.as_os_str())
    .env("CODE_INTELLIGENCE_REPOSITORY", &repository_id);
    let (mut events, mut child) = command
        .spawn()
        .map_err(|error| EngineDiagnostics::default().transport_error(&error.to_string()))?;
    let request = if reopen {
        json!({"version":1,"requestId":job_id,"jobId":job_id,"type":"reopen"})
    } else {
        json!({"version":1,"requestId":job_id,"jobId":job_id,"type":"analyze","root":root.to_string_lossy()})
    };
    let frame = format!("{}\n", request);
    if frame.len() > MAX_REQUEST {
        let _ = child.kill();
        return Err("Selected directory path exceeds protocol limits".into());
    }
    if child.write(frame.as_bytes()).is_err() {
        let _ = child.kill();
        return Err("Could not contact the bundled engine".into());
    }
    session.running = true;
    session.job_id = Some(job_id.clone());
    session.child = Some(child);
    drop(session);
    let reader_app = app.clone();
    tauri::async_runtime::spawn(async move {
        let mut diagnostics = EngineDiagnostics::default();
        while let Some(message) = events.recv().await {
            match message {
                CommandEvent::Stdout(bytes) => {
                    let event = match decode_event(&bytes, &job_id) {
                        Ok(event) => event,
                        Err(_) => {
                            fail(
                                &reader_app,
                                &job_id,
                                "protocol_failure",
                                "Engine protocol failed; retry analysis",
                            );
                            break;
                        }
                    };
                    let engine = reader_app.state::<Engine>();
                    let Ok(mut session) = engine.0.lock() else {
                        break;
                    };
                    // An old process cannot update a cancelled/replaced job.
                    if session.job_id.as_deref() != Some(&job_id) {
                        continue;
                    }
                    let event_type = event["type"].as_str().unwrap_or("");
                    if event_type == "progress" {
                        diagnostics.stage(event["stage"].as_str().unwrap_or(""));
                    } else if event_type == "complete" {
                        diagnostics.stage("complete");
                    }
                    if matches!(event_type, "progress" | "complete")
                        && (event["requestId"] != job_id || !session.running)
                    {
                        drop(session);
                        fail(
                            &reader_app,
                            &job_id,
                            "protocol_failure",
                            "Unexpected engine job event",
                        );
                        break;
                    }
                    if event_type == "complete" {
                        let snapshot = &event["snapshot"];
                        // Stored roots are native-authorized by lookup, even
                        // when absent. Reopening must not require the source.
                        let root_matches =
                            snapshot["origin"]["root"].as_str().map(PathBuf::from) == session.root;
                        let files = snapshot["files"].as_array();
                        if snapshot["version"] != 1
                            || snapshot["origin"]["kind"] != "local"
                            || !root_matches
                            || files.is_none()
                        {
                            drop(session);
                            fail(
                                &reader_app,
                                &job_id,
                                "protocol_failure",
                                "Invalid engine snapshot",
                            );
                            break;
                        }
                        let mut ids = HashSet::new();
                        let valid = files.unwrap().iter().all(|file| {
                            let Some(file_id) = file["id"].as_str() else {
                                return false;
                            };
                            relative_file(file_id)
                                && file["path"].as_str() == Some(file_id)
                                && ids.insert(file_id.to_owned())
                        });
                        if !valid {
                            drop(session);
                            fail(
                                &reader_app,
                                &job_id,
                                "protocol_failure",
                                "Invalid snapshot entities",
                            );
                            break;
                        }
                        session.files = ids;
                        session.running = false;
                    }
                    let request_id = event["requestId"].as_str().unwrap_or("");
                    if let Some(sender) = session.pending.remove(request_id) {
                        let reply = match event_type {
                            "evidence" => Ok(event["evidence"].clone()),
                            "query" => Ok(event["result"].clone()),
                            "investigation" => Ok(event["result"].clone()),
                            "explanation" => Ok(event["result"].clone()),
                            _ => Err("Evidence/query operation failed".into()),
                        };
                        let _ = sender.send(reply);
                    } else if event_type == "error" {
                        drop(session);
                        fail(
                            &reader_app,
                            &job_id,
                            "operation_failed",
                            event["message"].as_str().unwrap_or(
                                "Local analysis failed; the previous snapshot is retained",
                            ),
                        );
                        break;
                    }
                    drop(session);
                    if matches!(event_type, "complete" | "progress") {
                        let _ = reader_app.emit_to("main", "engine-event", event);
                    }
                }
                CommandEvent::Terminated(status) => {
                    fail(
                        &reader_app,
                        &job_id,
                        "engine_crashed",
                        &diagnostics.exited(status.code, status.signal),
                    );
                    break;
                }
                CommandEvent::Error(error) => {
                    fail(
                        &reader_app,
                        &job_id,
                        "engine_transport",
                        &diagnostics.transport_error(&error),
                    );
                    break;
                }
                CommandEvent::Stderr(bytes) => diagnostics.capture(&bytes),
                _ => {}
            }
        }
    });
    Ok(())
}

#[tauri::command]
async fn cancel_analysis(app: tauri::AppHandle, job_id: String) -> Result<(), String> {
    {
        let engine = app.state::<Engine>();
        let session = engine.0.lock().map_err(|_| "Engine state unavailable")?;
        if session.job_id.as_deref() != Some(&job_id) || !session.running {
            return Err("Unknown active job".into());
        }
    }
    let owner_pid = {
        let engine = app.state::<Engine>();
        let mut session = engine.0.lock().map_err(|_| "Engine state unavailable")?;
        if session.job_id.as_deref() != Some(&job_id) {
            return Err("Unknown job".into());
        }
        // Stop even if cancellation arrives before the engine creates its job.
        // SQLite rolls back an interrupted publication; an already committed
        // snapshot stays complete and is never relabelled as a cancelled result.
        let owner_pid = session.child.as_ref().ok_or("Engine unavailable")?.pid();
        stop(&mut session);
        owner_pid
    };
    let recorded = storage_request(
        &app,
        json!({"version":1,"type":"finish","jobId":job_id,"ownerPid":owner_pid,"state":"cancelled"}),
        None,
    )
    .await;
    let message = if recorded.is_ok() {
        "Analysis cancelled; the previous complete snapshot is retained"
    } else {
        "Engine stopped. Cancellation record unavailable; reopen the stored analysis to recover."
    };
    let _ = app.emit_to("main", "engine-event", json!({"version":1,"requestId":job_id,"jobId":job_id,"type":"error","code":"cancelled","message":message}));
    Ok(())
}

async fn request(
    app: tauri::AppHandle,
    job_id: String,
    file: String,
    query: Option<Value>,
    operation: &'static str,
) -> Reply {
    tauri::async_runtime::spawn_blocking(move || {
        let engine = app.state::<Engine>();
        let mut session = engine.0.lock().map_err(|_| "Engine state unavailable")?;
        if session.job_id.as_deref() != Some(&job_id) || session.running || (!matches!(operation, "investigation" | "explanation") && !session.files.contains(&file)) { return Err("Unknown or unavailable snapshot file".into()); }
        if session.pending.len() >= 16 { return Err("Too many pending evidence requests".into()); }
        let request_id = id();
        let event = match query {
            Some(query) => json!({"version":1,"requestId":request_id,"jobId":job_id,"type":operation,"query":query}),
            None => json!({"version":1,"requestId":request_id,"jobId":job_id,"type":"evidence","file":file}),
        };
        let frame = format!("{}\n", event);
        if frame.len() > MAX_REQUEST { return Err("Request exceeds protocol budget".into()); }
        let (sender, receiver) = mpsc::channel();
        session.child.as_mut().ok_or("Engine unavailable")?.write(frame.as_bytes()).map_err(|_| "Engine pipe unavailable")?;
        session.pending.insert(request_id.clone(), sender);
        drop(session);
        match receiver.recv_timeout(Duration::from_secs(20)) {
            Ok(reply) => reply,
            Err(_) => { if let Ok(mut session) = engine.0.lock() { session.pending.remove(&request_id); } Err("Engine request timed out; retry analysis".into()) }
        }
    }).await.map_err(|_| "Engine request failed".to_string())?
}
#[tauri::command]
async fn read_evidence(app: tauri::AppHandle, job_id: String, file: String) -> Reply {
    request(app, job_id, file, None, "evidence").await
}
#[tauri::command]
async fn query_structure(
    app: tauri::AppHandle,
    job_id: String,
    file: String,
    direction: String,
    depth: u8,
) -> Reply {
    if !matches!(direction.as_str(), "dependencies" | "dependents") || depth > 64 {
        return Err("Invalid structural query".into());
    }
    request(
        app,
        job_id,
        file.clone(),
        Some(json!({"file":file,"direction":direction,"depth":depth})),
        "query",
    )
    .await
}
fn valid_investigation(query: &Value) -> bool {
    let Some(q) = query.as_object() else {
        return false;
    };
    let fields: &[&str] = match query["operation"].as_str() {
        Some("search")
            if matches!(
                query["scope"].as_str(),
                Some("all" | "paths" | "exports" | "entries")
            ) =>
        {
            &["operation", "text", "scope", "budget"]
        }
        Some("ask")
            if matches!(
                query["intent"].as_str(),
                Some(
                    "dependencies" | "dependents" | "trace" | "routes" | "exports" | "unsupported"
                )
            ) && query["depth"].as_u64().is_some_and(|d| d <= 64) =>
        {
            &["operation", "intent", "target", "depth", "budget"]
        }
        _ => return false,
    };
    let text = if query["operation"] == "search" {
        &query["text"]
    } else {
        &query["target"]
    };
    q.len() == fields.len()
        && fields.iter().all(|field| q.contains_key(*field))
        && query["budget"].as_u64().is_some_and(|n| n > 0 && n <= 200)
        && text.as_str().is_some_and(|s| {
            s.encode_utf16().count()
                <= if query["operation"] == "search" {
                    256
                } else {
                    4096
                }
                && !s.contains('\0')
        })
}
#[tauri::command]
async fn investigate_snapshot(app: tauri::AppHandle, job_id: String, query: Value) -> Reply {
    if !valid_investigation(&query) {
        return Err("Invalid investigation request".into());
    }
    request(app, job_id, String::new(), Some(query), "investigation").await
}
fn valid_measurement(input: &Value) -> bool {
    let Some(m) = input.as_object() else {
        return false;
    };
    let keys = [
        "category",
        "elapsedMs",
        "usefulness",
        "discovered",
        "missed",
    ];
    m.len() == keys.len()
        && keys.iter().all(|key| m.contains_key(*key))
        && matches!(
            input["category"].as_str(),
            Some("understanding" | "impact" | "ask")
        )
        && input["elapsedMs"]
            .as_u64()
            .is_some_and(|n| n > 0 && n <= 86400000)
        && input["usefulness"]
            .as_u64()
            .is_some_and(|n| n > 0 && n <= 5)
        && ["discovered", "missed"]
            .iter()
            .all(|key| input[key].as_u64().is_some_and(|n| n <= 100000))
}
#[tauri::command]
async fn record_measurement(app: tauri::AppHandle, input: Value) -> Reply {
    if !valid_measurement(&input) {
        return Err("Invalid numeric pilot measurement".into());
    }
    let version = app.package_info().version.to_string();
    storage_request(
        &app,
        json!({"version":1,"type":"measurement","input":input,"applicationVersion":version}),
        None,
    )
    .await
}
#[tauri::command]
async fn pilot_measurements(app: tauri::AppHandle, reset: bool) -> Reply {
    storage_request(
        &app,
        json!({"version":1,"type":if reset {"reset-measurements"} else {"measurements"}}),
        None,
    )
    .await
}
fn allowed_navigation(url: &tauri::Url, development: Option<&tauri::Url>) -> bool {
    if !url.username().is_empty() || url.password().is_some() {
        return false;
    }
    let packaged = (url.scheme() == "tauri" && url.host_str() == Some("localhost"))
        || (matches!(url.scheme(), "http" | "https") && url.host_str() == Some("tauri.localhost"));
    // The CLI serves frontendDist on an ephemeral loopback origin in dev.
    // Accept only that configured origin, never arbitrary localhost services.
    packaged
        || development.is_some_and(|dev| {
            matches!(dev.scheme(), "http" | "https")
                && matches!(dev.host_str(), Some("127.0.0.1" | "localhost" | "[::1]"))
                && dev.username().is_empty()
                && dev.password().is_none()
                && url.origin() == dev.origin()
        })
}
fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .manage(Engine::default())
        .manage(Explanations::default())
        .setup(|app| {
            let development = if cfg!(debug_assertions) {
                app.config().build.dev_url.clone()
            } else {
                None
            };
            tauri::WebviewWindowBuilder::from_config(app, &app.config().app.windows[0])?
                .on_navigation(move |url| allowed_navigation(url, development.as_ref()))
                .initialization_script(include_str!("../../lib/desktop/startup.js"))
                .on_new_window(|_, _| tauri::webview::NewWindowResponse::Deny)
                .build()?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            select_repository,
            start_analysis,
            cancel_analysis,
            read_evidence,
            query_structure,
            investigate_snapshot,
            record_measurement,
            pilot_measurements,
            list_repositories,
            open_repository,
            forget_repository,
            local_settings,
            reopen_analysis,
            provider_configuration,
            prepare_explanation,
            send_explanation,
            cancel_explanation
        ])
        .build(tauri::generate_context!())
        .expect("Desktop initialization failed")
        .run(|app, event| {
            if matches!(event, tauri::RunEvent::Exit) {
                explanations::invalidate(app);
                if let Ok(mut session) = app.state::<Engine>().0.lock() {
                    session.closing = true;
                    stop(&mut session);
                    for (_, child) in session.storage_children.drain() {
                        let _ = child.kill();
                    }
                }
            }
        });
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn pilot_commands_enforce_query_and_measurement_allowlists() {
        let query =
            json!({"operation":"ask","intent":"trace","target":"entry.ts","depth":64,"budget":200});
        assert!(valid_investigation(&query));
        for (key, value) in [
            ("intent", json!("calls")),
            ("depth", json!(65)),
            ("budget", json!(0)),
            ("root", json!("C:/private")),
        ] {
            let mut hostile = query.clone();
            hostile[key] = value;
            assert!(!valid_investigation(&hostile));
        }
        let input =
            json!({"category":"impact","elapsedMs":1000,"usefulness":4,"discovered":1,"missed":0});
        assert!(valid_measurement(&input));
        for (key, value) in [
            ("elapsedMs", json!("source")),
            ("category", json!("repo-name")),
            ("discovered", json!(-1)),
            ("repositoryId", json!("id")),
            ("prompt", json!("secret")),
        ] {
            let mut hostile = input.clone();
            hostile[key] = value;
            assert!(!valid_measurement(&hostile));
        }
    }
    #[test]
    fn navigation_accepts_only_packaged_or_exact_configured_development_origin() {
        let dev = tauri::Url::parse("http://127.0.0.1:1430/").unwrap();
        for value in ["tauri://localhost/", "http://tauri.localhost/"] {
            assert!(allowed_navigation(&tauri::Url::parse(value).unwrap(), None));
        }
        let target = tauri::Url::parse("http://127.0.0.1:1430/").unwrap();
        assert!(allowed_navigation(&target, Some(&dev)));
        assert!(!allowed_navigation(&target, None));
        for value in [
            "http://127.0.0.1:1431/",
            "http://localhost:1430/",
            "https://example.com/",
            "http://user@127.0.0.1:1430/",
        ] {
            assert!(!allowed_navigation(
                &tauri::Url::parse(value).unwrap(),
                Some(&dev)
            ));
        }
        let remote = tauri::Url::parse("https://example.com/").unwrap();
        assert!(!allowed_navigation(&remote, Some(&remote)));
    }
    #[test]
    fn storage_reply_waits_are_bounded_and_do_not_hide_errors() {
        let (sender, receiver) = mpsc::channel();
        sender.send(Err("storage failure".into())).unwrap();
        assert_eq!(
            receive_storage_reply(receiver, Duration::from_millis(20)),
            Err("storage failure".into())
        );
        let (_sender, receiver) = mpsc::channel();
        assert!(receive_storage_reply(receiver, Duration::from_millis(20))
            .unwrap_err()
            .contains("timed out"));
        let (sender, receiver) = mpsc::channel();
        drop(sender);
        assert!(receive_storage_reply(receiver, Duration::from_millis(20))
            .unwrap_err()
            .contains("unavailable"));
    }
    #[test]
    fn protocol_rejects_bad_versions_fields_stale_jobs_and_limits() {
        let good = json!({"version":1,"requestId":"job-1","jobId":"job-1","type":"progress","stage":"parse"});
        assert!(decode_event(good.to_string().as_bytes(), "job-1").is_ok());
        assert!(decode_event(good.to_string().as_bytes(), "job-2").is_err());
        for (field, value) in [
            ("version", json!(2)),
            ("command", json!("arbitrary")),
            ("stage", json!("fake")),
        ] {
            let mut bad = good.clone();
            bad[field] = value;
            assert!(decode_event(bad.to_string().as_bytes(), "job-1").is_err());
        }
        assert!(decode_event(&vec![b'x'; MAX_EVENT + 1], "job-1").is_err());
        assert!(decode_event(b"not json", "job-1").is_err());
    }
    #[test]
    fn evidence_entities_cannot_escape_roots() {
        for file in [
            "../secret",
            "/etc/passwd",
            "C:\\secret",
            "a/../secret",
            "a//b",
            "a\\b",
            "",
        ] {
            assert!(!relative_file(file));
        }
        assert!(relative_file("src/main.ts"));
    }
    #[test]
    fn stopping_invalidates_job_and_pending_requests() {
        let (sender, receiver) = mpsc::channel();
        let mut session = Session {
            job_id: Some("job-1".into()),
            running: true,
            ..Default::default()
        };
        session.files.insert("src/a.ts".into());
        session.pending.insert("req-1".into(), sender);
        stop(&mut session);
        assert!(!session.running && session.job_id.is_none() && session.files.is_empty());
        assert!(receiver.recv().unwrap().is_err());
    }
    #[test]
    fn native_start_requires_selection_and_rejects_conflicts_and_reused_jobs() {
        let mut session = Session::default();
        assert!(check_start(&session, "forged", "job-1").is_err());
        session.repository_id = "selected".into();
        session.root = Some(PathBuf::from("selected-root"));
        assert!(check_start(&session, "selected", "job-1").is_ok());
        session.running = true;
        assert!(check_start(&session, "selected", "job-1").is_err());
        session.running = false;
        session.choosing = true;
        assert!(check_start(&session, "selected", "job-1").is_err());
        session.choosing = false;
        session.used_jobs.insert("job-1".into());
        assert!(check_start(&session, "selected", "job-1").is_err());
        assert!(check_start(&session, "selected", "job-2").is_ok());
    }
}
