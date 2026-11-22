// Prevents additional console window on Windows in release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::path::PathBuf;
use std::sync::Mutex;
use tauri::{Manager, RunEvent};
use tauri_plugin_shell::process::CommandChild;
use tauri_plugin_shell::ShellExt;

struct SidecarState {
    children: Mutex<Vec<CommandChild>>,
}

#[tauri::command]
fn get_desktop_info() -> serde_json::Value {
    serde_json::json!({
        "desktop": true,
        "os": std::env::consts::OS,
        "arch": std::env::consts::ARCH,
        "version": env!("CARGO_PKG_VERSION")
    })
}

fn resolve_bundled_adb_path() -> Option<PathBuf> {
    let exe = std::env::current_exe().ok()?;
    let exe_dir = exe.parent()?;
    let adb_name = if cfg!(windows) { "adb.exe" } else { "adb" };
    let candidate = exe_dir.join(adb_name);
    if candidate.exists() {
        Some(candidate)
    } else {
        None
    }
}

fn spawn_sidecars(app: &tauri::AppHandle) {
    let state = app.state::<SidecarState>();
    let mut children = state.children.lock().unwrap_or_else(|e| e.into_inner());

    let adb_path = resolve_bundled_adb_path();

    // 1. Spawn qa-orchestrator sidecar on port 4000
    if let Ok(mut cmd) = app.shell().sidecar("qa-orchestrator") {
        cmd = cmd.env("PORT", "4000").env("WEB_UI_URL", "http://localhost:3000");
        if let Some(ref adb) = adb_path {
            cmd = cmd.env("QA_STUDIO_ADB_PATH", adb.to_string_lossy().as_ref());
            if let Some(parent) = adb.parent() {
                let current_path = std::env::var("PATH").unwrap_or_default();
                let sep = if cfg!(windows) { ";" } else { ":" };
                cmd = cmd.env("PATH", format!("{}{}{}", parent.display(), sep, current_path));
            }
        }
        if let Ok((_rx, child)) = cmd.spawn() {
            children.push(child);
        }
    }

    // 2. Spawn ws-scrcpy sidecar on port 8000 connected to bundled ADB
    if let Ok(mut cmd) = app.shell().sidecar("ws-scrcpy") {
        cmd = cmd.env("PORT", "8000");
        if let Some(ref adb) = adb_path {
            if let Some(parent) = adb.parent() {
                let current_path = std::env::var("PATH").unwrap_or_default();
                let sep = if cfg!(windows) { ";" } else { ":" };
                cmd = cmd.env("PATH", format!("{}{}{}", parent.display(), sep, current_path));
            }
        }
        if let Ok((_rx, child)) = cmd.spawn() {
            children.push(child);
        }
    }
}

fn shutdown_sidecars(app: &tauri::AppHandle) {
    let state = app.state::<SidecarState>();
    let mut children = state.children.lock().unwrap_or_else(|e| e.into_inner());
    for child in children.drain(..) {
        let _ = child.kill();
    }
}

fn main() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .manage(SidecarState {
            children: Mutex::new(Vec::new()),
        })
        .invoke_handler(tauri::generate_handler![get_desktop_info])
        .setup(|app| {
            // In production bundle, automatically start bundled sidecars.
            // In `npm run dev:desktop`, concurrently already runs orchestrator on :4000.
            if !cfg!(debug_assertions) {
                spawn_sidecars(app.handle());
            }
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building Local Web QA Studio desktop application");

    app.run(|app_handle, event| {
        if matches!(event, RunEvent::ExitRequested { .. } | RunEvent::Exit) {
            shutdown_sidecars(app_handle);
        }
    });
}
