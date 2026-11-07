//! SQLite storage. One connection behind a Mutex is plenty for a single-user desktop app.
//!
//! Migrations are keyed on `PRAGMA user_version`: append a new entry to MIGRATIONS,
//! never edit an old one.

use crate::paths;
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use tauri::{AppHandle, State};

pub struct Db(pub Mutex<Connection>);

const MIGRATIONS: &[&str] = &[
    // v1 — initial schema
    r#"
    CREATE TABLE students (
        id          INTEGER PRIMARY KEY,
        name        TEXT NOT NULL,
        created_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE tasks (
        id                INTEGER PRIMARY KEY,
        section           TEXT NOT NULL CHECK (section IN ('speaking','writing')),
        task_type         TEXT NOT NULL CHECK (task_type IN ('independent','integrated')),
        title             TEXT NOT NULL,
        prompt            TEXT NOT NULL,
        material          TEXT,
        prep_seconds      INTEGER NOT NULL DEFAULT 0,
        response_seconds  INTEGER NOT NULL,
        created_at        TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE attempts (
        id                INTEGER PRIMARY KEY,
        student_id        INTEGER REFERENCES students(id) ON DELETE SET NULL,
        task_id           INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
        response_text     TEXT NOT NULL,          -- typed essay or Whisper transcript
        audio_path        TEXT,                   -- speaking only, relative to data dir
        duration_seconds  REAL,
        created_at        TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE evaluations (
        id             INTEGER PRIMARY KEY,
        attempt_id     INTEGER NOT NULL REFERENCES attempts(id) ON DELETE CASCADE,
        model_id       TEXT NOT NULL,
        rubric_json    TEXT NOT NULL,             -- per-criterion evidence + score
        total_score    REAL,
        feedback       TEXT,
        sample_answer  TEXT,
        teacher_score  REAL,                      -- for the agreement study in the report
        latency_ms     INTEGER,
        created_at     TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX idx_attempts_student ON attempts(student_id);
    CREATE INDEX idx_attempts_task ON attempts(task_id);
    CREATE INDEX idx_evaluations_attempt ON evaluations(attempt_id);
    "#,
    // v2 — TOEFL iBT 2026 task types. SQLite cannot alter a CHECK constraint, so the
    // table is rebuilt (runs with foreign_keys OFF; see `open`). Existing rows are kept:
    // old speaking → interview, old writing → academic_discussion.
    r#"
    CREATE TABLE tasks_new (
        id                INTEGER PRIMARY KEY,
        section           TEXT NOT NULL,
        task_type         TEXT NOT NULL,
        title             TEXT NOT NULL,
        prompt            TEXT NOT NULL,   -- listen_repeat: instructions · interview: question
                                           -- email: situation · academic_discussion: professor's post
        material          TEXT,            -- listen_repeat: target sentences, one per line
                                           -- academic_discussion: classmates' posts
        prep_seconds      INTEGER NOT NULL DEFAULT 0,
        response_seconds  INTEGER NOT NULL,
        created_at        TEXT NOT NULL DEFAULT (datetime('now')),
        CHECK (
            (section = 'speaking' AND task_type IN ('listen_repeat', 'interview')) OR
            (section = 'writing'  AND task_type IN ('email', 'academic_discussion'))
        )
    );
    INSERT INTO tasks_new (id, section, task_type, title, prompt, material, prep_seconds, response_seconds, created_at)
    SELECT id, section,
           CASE WHEN section = 'speaking' THEN 'interview' ELSE 'academic_discussion' END,
           title, prompt, material, 0,
           CASE WHEN section = 'speaking' THEN 45 ELSE 600 END,
           created_at
    FROM tasks;
    DROP TABLE tasks;
    ALTER TABLE tasks_new RENAME TO tasks;
    "#,
    // v3: teacher's own corrections + verdicts on AI corrections (JSON, src/lib/review.ts).
    r#"
    ALTER TABLE attempts ADD COLUMN teacher_review TEXT;
    "#,
];

pub fn open(app: &AppHandle) -> Result<Db, String> {
    let path = paths::db_path(app)?;
    let mut conn = Connection::open(&path).map_err(|e| format!("open {}: {e}", path.display()))?;
    // Migrations run with foreign keys OFF so table rebuilds (DROP + RENAME) don't cascade
    // into attempts/evaluations. Integrity is checked before turning them back on.
    conn.execute_batch("PRAGMA foreign_keys = OFF; PRAGMA journal_mode = WAL;")
        .map_err(|e| e.to_string())?;
    migrate(&mut conn)?;
    let broken: i64 = conn
        .query_row("SELECT count(*) FROM pragma_foreign_key_check", [], |r| r.get(0))
        .map_err(|e| e.to_string())?;
    if broken > 0 {
        return Err(format!("database integrity check failed ({broken} broken references)"));
    }
    conn.execute_batch("PRAGMA foreign_keys = ON;").map_err(|e| e.to_string())?;
    Ok(Db(Mutex::new(conn)))
}

/// Fresh, fully migrated schema for unit tests in other modules.
#[cfg(test)]
pub fn migrate_for_test(conn: &mut Connection) {
    conn.execute_batch("PRAGMA foreign_keys = OFF;").unwrap();
    migrate(conn).unwrap();
}

fn migrate(conn: &mut Connection) -> Result<(), String> {
    let current: usize = conn
        .query_row("PRAGMA user_version", [], |r| r.get::<_, i64>(0))
        .map_err(|e| e.to_string())? as usize;
    for (i, sql) in MIGRATIONS.iter().enumerate().skip(current) {
        let tx = conn.transaction().map_err(|e| e.to_string())?;
        tx.execute_batch(sql).map_err(|e| format!("migration v{}: {e}", i + 1))?;
        tx.execute_batch(&format!("PRAGMA user_version = {}", i + 1))
            .map_err(|e| e.to_string())?;
        tx.commit().map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NewTask {
    pub section: String,
    pub task_type: String,
    pub title: String,
    pub prompt: String,
    pub material: Option<String>,
    pub prep_seconds: i64,
    pub response_seconds: i64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Task {
    pub id: i64,
    #[serde(flatten)]
    pub fields: NewTask,
    pub created_at: String,
}

#[tauri::command]
pub fn list_tasks(db: State<'_, Db>) -> Result<Vec<Task>, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare(
            "SELECT id, section, task_type, title, prompt, material, prep_seconds, \
             response_seconds, created_at FROM tasks ORDER BY id DESC",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |r| {
            Ok(Task {
                id: r.get(0)?,
                fields: NewTask {
                    section: r.get(1)?,
                    task_type: r.get(2)?,
                    title: r.get(3)?,
                    prompt: r.get(4)?,
                    material: r.get(5)?,
                    prep_seconds: r.get(6)?,
                    response_seconds: r.get(7)?,
                },
                created_at: r.get(8)?,
            })
        })
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn create_task(db: State<'_, Db>, task: NewTask) -> Result<i64, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO tasks (section, task_type, title, prompt, material, prep_seconds, response_seconds) \
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        params![
            task.section,
            task.task_type,
            task.title.trim(),
            task.prompt.trim(),
            task.material,
            task.prep_seconds,
            task.response_seconds
        ],
    )
    .map_err(|e| e.to_string())?;
    Ok(conn.last_insert_rowid())
}

/// Update a task's content. The type (and section) never changes: attempts already scored
/// against it would no longer match their rubric.
pub fn update_task_row(conn: &Connection, id: i64, task: &NewTask) -> Result<(), String> {
    if task.title.trim().is_empty() || task.prompt.trim().is_empty() {
        return Err("제목과 문제 내용은 비워 둘 수 없습니다.".into());
    }
    let n = conn
        .execute(
            "UPDATE tasks SET title = ?1, prompt = ?2, material = ?3, prep_seconds = ?4, response_seconds = ?5 \
             WHERE id = ?6",
            params![
                task.title.trim(),
                task.prompt.trim(),
                task.material.as_deref().map(str::trim).filter(|m| !m.is_empty()),
                task.prep_seconds.clamp(0, 600),
                task.response_seconds.clamp(5, 3600),
                id
            ],
        )
        .map_err(|e| e.to_string())?;
    if n == 0 {
        return Err(format!("문제를 찾을 수 없습니다 (#{id})"));
    }
    Ok(())
}

#[tauri::command]
pub fn update_task(db: State<'_, Db>, id: i64, task: NewTask) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    update_task_row(&conn, id, &task)
}

/// How many attempts use this task (shown as a warning on the edit page).
#[tauri::command]
pub fn count_task_attempts(db: State<'_, Db>, id: i64) -> Result<i64, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    conn.query_row("SELECT count(*) FROM attempts WHERE task_id = ?1", params![id], |r| r.get(0))
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_task(db: State<'_, Db>, id: i64) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM tasks WHERE id = ?1", params![id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn update_task_keeps_type_and_validates() {
        let mut conn = Connection::open_in_memory().unwrap();
        migrate_for_test(&mut conn);
        conn.execute(
            "INSERT INTO tasks (id, section, task_type, title, prompt, response_seconds) VALUES (1, 'writing', 'email', 'Old', 'Q', 420)",
            [],
        )
        .unwrap();
        let mut t = NewTask {
            section: "speaking".into(),
            task_type: "interview".into(), // ignored: the type never changes
            title: "  New title ".into(),
            prompt: "New prompt".into(),
            material: Some("   ".into()),
            prep_seconds: -5,
            response_seconds: 99999,
        };
        update_task_row(&conn, 1, &t).unwrap();
        let row: (String, String, Option<String>, i64, i64, String) = conn
            .query_row("SELECT title, task_type, material, prep_seconds, response_seconds, prompt FROM tasks WHERE id = 1", [], |r| {
                Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?, r.get(5)?))
            })
            .unwrap();
        assert_eq!(row, ("New title".into(), "email".into(), None, 0, 3600, "New prompt".into()));
        t.title = " ".into();
        assert!(update_task_row(&conn, 1, &t).is_err());
        t.title = "x".into();
        assert!(update_task_row(&conn, 99, &t).is_err());
    }

    /// A v1 database with data must upgrade to v2 without losing rows or breaking FKs.
    #[test]
    fn migrate_v1_to_v2_keeps_rows_and_references() {
        let mut conn = Connection::open_in_memory().unwrap();
        conn.execute_batch("PRAGMA foreign_keys = OFF;").unwrap();
        conn.execute_batch(MIGRATIONS[0]).unwrap();
        conn.execute_batch("PRAGMA user_version = 1;").unwrap();
        conn.execute_batch(
            "INSERT INTO tasks (id, section, task_type, title, prompt, prep_seconds, response_seconds)
               VALUES (1, 'speaking', 'independent', 'Old speaking', 'Q?', 15, 45),
                      (2, 'writing', 'integrated', 'Old writing', 'Essay', 0, 1200);
             INSERT INTO attempts (id, task_id, response_text) VALUES (10, 2, 'my essay');",
        )
        .unwrap();

        migrate(&mut conn).unwrap();

        let version: i64 = conn.query_row("PRAGMA user_version", [], |r| r.get(0)).unwrap();
        assert_eq!(version as usize, MIGRATIONS.len());
        let types: Vec<(i64, String, i64)> = conn
            .prepare("SELECT id, task_type, response_seconds FROM tasks ORDER BY id")
            .unwrap()
            .query_map([], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)))
            .unwrap()
            .collect::<Result<_, _>>()
            .unwrap();
        assert_eq!(types, vec![(1, "interview".into(), 45), (2, "academic_discussion".into(), 600)]);

        let broken: i64 = conn
            .query_row("SELECT count(*) FROM pragma_foreign_key_check", [], |r| r.get(0))
            .unwrap();
        assert_eq!(broken, 0, "attempts must still reference tasks");

        // New CHECK constraint rejects mismatched section/type pairs.
        conn.execute_batch("PRAGMA foreign_keys = ON;").unwrap();
        let bad = conn.execute(
            "INSERT INTO tasks (section, task_type, title, prompt, response_seconds)
             VALUES ('speaking', 'email', 't', 'p', 10)",
            [],
        );
        assert!(bad.is_err());
    }
}
