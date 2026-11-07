mod audio;
mod taskfile;
mod db;
mod engine;
mod models;
mod paths;
mod records;

use serde::Serialize;
use tauri::{AppHandle, Manager, RunEvent};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct EngineStatus {
    whisper: bool,
    llama: bool,
    onnxruntime: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct AppInfo {
    version: String,
    platform: &'static str,
    arch: &'static str,
    data_dir: String,
    models_dir: String,
    engines: EngineStatus,
}

#[tauri::command]
fn app_info(app: AppHandle) -> Result<AppInfo, String> {
    Ok(AppInfo {
        version: app.package_info().version.to_string(),
        platform: std::env::consts::OS,
        arch: std::env::consts::ARCH,
        data_dir: paths::data_dir(&app)?.display().to_string(),
        models_dir: paths::models_dir(&app)?.display().to_string(),
        engines: EngineStatus {
            whisper: paths::whisper_bin(&app)?.is_file(),
            llama: paths::llama_bin(&app)?.is_file(),
            onnxruntime: engine::gec::runtime_present(&app),
        },
    })
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(engine::llama::LlamaState::default())
        .manage(models::Downloads::default())
        .manage(engine::gec::GecState::default())
        .setup(|app| {
            let db = db::open(app.handle())?;
            app.manage(db);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            app_info,
            models::list_models,
            models::download_model,
            models::delete_model,
            engine::whisper::transcribe,
            audio::save_audio,
            audio::read_audio,
            taskfile::read_task_file,
            taskfile::write_task_file,
            engine::llama::llm_start,
            engine::llama::llm_chat,
            engine::llama::llm_stop,
            engine::gec::gec_check,
            db::list_tasks,
            db::create_task,
            db::delete_task,
            records::list_students,
            records::create_student,
            records::create_attempt,
            records::create_evaluation,
            records::set_sample_answer,
            records::set_teacher_score,
            records::get_attempt,
            records::set_teacher_review,
            records::list_attempts,
        ])
        .build(tauri::generate_context!())
        .expect("error while building EFL Sprite")
        .run(|app, event| {
            if let RunEvent::Exit = event {
                engine::llama::stop(app);
            }
        });
}
