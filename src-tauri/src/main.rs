#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod engine_process;
use engine_process::{engine_command, EngineDiagnostics};

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
    if !valid_id(job_id) || session.used_jobs.contains(job_id) || session.used_jobs.len() >= 10000 {
        return Err("Invalid, reused or exhausted job identity".into());
    }
    if repository_id != session.repository_id {
        return Err("Repository was not selected by the native picker".into());
    }
    if session.running || session.choosing {
        return Err("An analysis or directory selection is already active".into());
    }
    session
        .root
        .clone()
        .ok_or("Select a repository first".into())
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
    let engine = app.state::<Engine>();
    let Ok(mut session) = engine.0.lock() else {
        return;
    };
    if session.job_id.as_deref() != Some(job) {
        return;
    }
    stop(&mut session);
    let _ = app.emit_to("main", "engine-event", json!({"version":1,"requestId":job,"jobId":job,"type":"error","code":code,"message":message}));
}

#[tauri::command]
async fn select_repository(app: tauri::AppHandle) -> Result<Option<Repository>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let engine = app.state::<Engine>();
        let mut session = engine.0.lock().map_err(|_| "Engine state unavailable")?;
        if session.running || session.choosing {
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
        Ok(Some(Repository {
            repository_id: session.repository_id.clone(),
            root: root.to_string_lossy().into_owned(),
        }))
    })
    .await
    .map_err(|_| "Directory selection failed".to_string())?
}

#[tauri::command]
async fn start_analysis(
    app: tauri::AppHandle,
    repository_id: String,
    job_id: String,
) -> Result<(), String> {
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
    )?;
    let (mut events, mut child) = command
        .spawn()
        .map_err(|error| EngineDiagnostics::default().transport_error(&error.to_string()))?;
    let request = json!({"version":1,"requestId":job_id,"jobId":job_id,"type":"analyze","root":root.to_string_lossy()});
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
                        let root_matches = snapshot["origin"]["root"]
                            .as_str()
                            .and_then(|root| Path::new(root).canonicalize().ok())
                            == session.root;
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
                            _ => Err("Evidence/query operation failed".into()),
                        };
                        let _ = sender.send(reply);
                    } else if event_type == "error" {
                        drop(session);
                        fail(
                            &reader_app,
                            &job_id,
                            "operation_failed",
                            "Local analysis failed; check directory access and analysis limits",
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
fn cancel_analysis(app: tauri::AppHandle, job_id: String) -> Result<(), String> {
    let engine = app.state::<Engine>();
    let mut session = engine.0.lock().map_err(|_| "Engine state unavailable")?;
    if session.job_id.as_deref() != Some(&job_id) {
        return Err("Unknown job".into());
    }
    stop(&mut session);
    let _ = app.emit_to("main", "engine-event", json!({"version":1,"requestId":job_id,"jobId":job_id,"type":"error","code":"cancelled","message":"Analysis cancelled; ready to retry"}));
    Ok(())
}

async fn request(
    app: tauri::AppHandle,
    job_id: String,
    file: String,
    query: Option<Value>,
) -> Reply {
    tauri::async_runtime::spawn_blocking(move || {
        let engine = app.state::<Engine>();
        let mut session = engine.0.lock().map_err(|_| "Engine state unavailable")?;
        if session.job_id.as_deref() != Some(&job_id) || session.running || !session.files.contains(&file) { return Err("Unknown or unavailable snapshot file".into()); }
        if session.pending.len() >= 16 { return Err("Too many pending evidence requests".into()); }
        let request_id = id();
        let event = match query {
            Some(query) => json!({"version":1,"requestId":request_id,"jobId":job_id,"type":"query","query":query}),
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
    request(app, job_id, file, None).await
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
    )
    .await
}
fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .manage(Engine::default())
        .setup(|app| {
            tauri::WebviewWindowBuilder::from_config(app, &app.config().app.windows[0])?
                .on_navigation(|url| {
                    (url.scheme() == "tauri" && url.host_str() == Some("localhost"))
                        || (matches!(url.scheme(), "http" | "https")
                            && url.host_str() == Some("tauri.localhost"))
                })
                .on_new_window(|_, _| tauri::webview::NewWindowResponse::Deny)
                .build()?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            select_repository,
            start_analysis,
            cancel_analysis,
            read_evidence,
            query_structure
        ])
        .build(tauri::generate_context!())
        .expect("Desktop initialization failed")
        .run(|app, event| {
            if matches!(event, tauri::RunEvent::Exit) {
                if let Ok(mut session) = app.state::<Engine>().0.lock() {
                    stop(&mut session);
                }
            }
        });
}

#[cfg(test)]
mod tests {
    use super::*;
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
