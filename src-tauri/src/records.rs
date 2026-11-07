//! Students, attempts and evaluations (tables created in db.rs migration v1).
//!
//! Query logic lives in plain functions over `&Connection` so it can be unit-tested;
//! the `#[tauri::command]` wrappers only lock the shared connection.

use crate::db::Db;
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use tauri::State;

type R<T> = Result<T, String>;

fn lock<'a>(db: &'a State<'_, Db>) -> R<std::sync::MutexGuard<'a, Connection>> {
    db.0.lock().map_err(|x| x.to_string())
}
fn e(err: rusqlite::Error) -> String {
    err.to_string()
}

// ---------------------------------------------------------------- students

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Student {
    pub id: i64,
    pub name: String,
    pub created_at: String,
}

pub fn students(conn: &Connection) -> R<Vec<Student>> {
    let mut st = conn
        .prepare("SELECT id, name, created_at FROM students ORDER BY name COLLATE NOCASE")
        .map_err(e)?;
    let rows = st
        .query_map([], |r| Ok(Student { id: r.get(0)?, name: r.get(1)?, created_at: r.get(2)? }))
        .map_err(e)?;
    rows.collect::<Result<_, _>>().map_err(e)
}

pub fn add_student(conn: &Connection, name: &str) -> R<i64> {
    let name = name.trim();
    if name.is_empty() {
        return Err("학생 이름을 입력해 주세요.".into());
    }
    conn.execute("INSERT INTO students (name) VALUES (?1)", params![name]).map_err(e)?;
    Ok(conn.last_insert_rowid())
}

// ---------------------------------------------------------------- attempts

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NewAttempt {
    pub task_id: i64,
    pub student_id: Option<i64>,
    pub response_text: String,
    pub audio_path: Option<String>,
    pub duration_seconds: Option<f64>,
}

pub fn add_attempt(conn: &Connection, a: &NewAttempt) -> R<i64> {
    conn.execute(
        "INSERT INTO attempts (task_id, student_id, response_text, audio_path, duration_seconds) \
         VALUES (?1, ?2, ?3, ?4, ?5)",
        params![a.task_id, a.student_id, a.response_text, a.audio_path, a.duration_seconds],
    )
    .map_err(e)?;
    Ok(conn.last_insert_rowid())
}

// ------------------------------------------------------------- evaluations

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NewEvaluation {
    pub attempt_id: i64,
    pub model_id: String,
    /// Full evaluation object from src/lib/scoring.ts, JSON-encoded.
    pub rubric_json: String,
    /// Estimated band (1.0–6.0) or Listen & Repeat accuracy-derived band.
    pub total_score: Option<f64>,
    pub feedback: Option<String>,
    pub latency_ms: Option<i64>,
}

pub fn add_evaluation(conn: &Connection, v: &NewEvaluation) -> R<i64> {
    conn.execute(
        "INSERT INTO evaluations (attempt_id, model_id, rubric_json, total_score, feedback, latency_ms) \
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![v.attempt_id, v.model_id, v.rubric_json, v.total_score, v.feedback, v.latency_ms],
    )
    .map_err(e)?;
    Ok(conn.last_insert_rowid())
}

// ------------------------------------------------------------------ reading

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EvaluationRow {
    pub id: i64,
    pub model_id: String,
    pub rubric_json: String,
    pub total_score: Option<f64>,
    pub sample_answer: Option<String>,
    pub teacher_score: Option<f64>,
    pub latency_ms: Option<i64>,
    pub created_at: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AttemptDetail {
    pub id: i64,
    pub task_id: i64,
    pub task_title: String,
    pub section: String,
    pub task_type: String,
    pub prompt: String,
    pub material: Option<String>,
    pub student_id: Option<i64>,
    pub student_name: Option<String>,
    pub response_text: String,
    pub audio_path: Option<String>,
    pub duration_seconds: Option<f64>,
    pub created_at: String,
    /// Teacher review JSON (corrections + verdicts on AI corrections), if any.
    pub teacher_review: Option<String>,
    /// Latest evaluation, if the attempt has been scored.
    pub evaluation: Option<EvaluationRow>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AttemptSummary {
    pub id: i64,
    pub created_at: String,
    pub student_name: Option<String>,
    pub task_title: String,
    pub task_type: String,
    pub band: Option<f64>,
    pub teacher_score: Option<f64>,
    /// Per-criterion scores of the latest evaluation (for refitting the band table).
    pub criterion_scores: Option<Vec<f64>>,
    /// Teacher review JSON (for the AI-correction precision figure on History).
    pub teacher_review: Option<String>,
}

/// `criteria[].score` from a stored evaluation JSON; None if it has no criteria.
fn criterion_scores(rubric_json: Option<String>) -> Option<Vec<f64>> {
    let v: serde_json::Value = serde_json::from_str(&rubric_json?).ok()?;
    let xs: Vec<f64> = v.get("criteria")?.as_array()?.iter().filter_map(|c| c.get("score")?.as_f64()).collect();
    if xs.is_empty() { None } else { Some(xs) }
}

fn latest_evaluation(conn: &Connection, attempt_id: i64) -> R<Option<EvaluationRow>> {
    conn.query_row(
        "SELECT id, model_id, rubric_json, total_score, sample_answer, teacher_score, latency_ms, created_at \
         FROM evaluations WHERE attempt_id = ?1 ORDER BY id DESC LIMIT 1",
        params![attempt_id],
        |r| {
            Ok(EvaluationRow {
                id: r.get(0)?,
                model_id: r.get(1)?,
                rubric_json: r.get(2)?,
                total_score: r.get(3)?,
                sample_answer: r.get(4)?,
                teacher_score: r.get(5)?,
                latency_ms: r.get(6)?,
                created_at: r.get(7)?,
            })
        },
    )
    .optional()
    .map_err(e)
}

pub fn attempt(conn: &Connection, id: i64) -> R<AttemptDetail> {
    let mut d = conn
        .query_row(
            "SELECT a.id, a.task_id, t.title, t.section, t.task_type, t.prompt, t.material, \
                    a.student_id, s.name, a.response_text, a.audio_path, a.duration_seconds, a.created_at, a.teacher_review \
             FROM attempts a JOIN tasks t ON t.id = a.task_id LEFT JOIN students s ON s.id = a.student_id \
             WHERE a.id = ?1",
            params![id],
            |r| {
                Ok(AttemptDetail {
                    id: r.get(0)?,
                    task_id: r.get(1)?,
                    task_title: r.get(2)?,
                    section: r.get(3)?,
                    task_type: r.get(4)?,
                    prompt: r.get(5)?,
                    material: r.get(6)?,
                    student_id: r.get(7)?,
                    student_name: r.get(8)?,
                    response_text: r.get(9)?,
                    audio_path: r.get(10)?,
                    duration_seconds: r.get(11)?,
                    created_at: r.get(12)?,
                    teacher_review: r.get(13)?,
                    evaluation: None,
                })
            },
        )
        .map_err(|err| match err {
            rusqlite::Error::QueryReturnedNoRows => format!("응시 기록을 찾을 수 없습니다 (#{id})"),
            other => other.to_string(),
        })?;
    d.evaluation = latest_evaluation(conn, id)?;
    Ok(d)
}

pub fn attempts(conn: &Connection, student_id: Option<i64>, limit: i64) -> R<Vec<AttemptSummary>> {
    let mut st = conn
        .prepare(
            "SELECT a.id, a.created_at, s.name, t.title, t.task_type, \
                    (SELECT total_score FROM evaluations v WHERE v.attempt_id = a.id ORDER BY v.id DESC LIMIT 1), \
                    (SELECT teacher_score FROM evaluations v WHERE v.attempt_id = a.id ORDER BY v.id DESC LIMIT 1), \
                    (SELECT rubric_json FROM evaluations v WHERE v.attempt_id = a.id ORDER BY v.id DESC LIMIT 1), \
                    a.teacher_review \
             FROM attempts a JOIN tasks t ON t.id = a.task_id LEFT JOIN students s ON s.id = a.student_id \
             WHERE (?1 IS NULL OR a.student_id = ?1) \
             ORDER BY a.id DESC LIMIT ?2",
        )
        .map_err(e)?;
    let rows = st
        .query_map(params![student_id, limit], |r| {
            Ok(AttemptSummary {
                id: r.get(0)?,
                created_at: r.get(1)?,
                student_name: r.get(2)?,
                task_title: r.get(3)?,
                task_type: r.get(4)?,
                band: r.get(5)?,
                teacher_score: r.get(6)?,
                criterion_scores: criterion_scores(r.get(7)?),
                teacher_review: r.get(8)?,
            })
        })
        .map_err(e)?;
    rows.collect::<Result<_, _>>().map_err(e)
}

// ----------------------------------------------------------------- commands

#[tauri::command]
pub fn list_students(db: State<'_, Db>) -> R<Vec<Student>> {
    students(&*lock(&db)?)
}

#[tauri::command]
pub fn create_student(db: State<'_, Db>, name: String) -> R<i64> {
    add_student(&*lock(&db)?, &name)
}

#[tauri::command]
pub fn create_attempt(db: State<'_, Db>, attempt: NewAttempt) -> R<i64> {
    add_attempt(&*lock(&db)?, &attempt)
}

#[tauri::command]
pub fn create_evaluation(db: State<'_, Db>, evaluation: NewEvaluation) -> R<i64> {
    add_evaluation(&*lock(&db)?, &evaluation)
}

#[tauri::command]
pub fn set_sample_answer(db: State<'_, Db>, evaluation_id: i64, text: String) -> R<()> {
    let conn = lock(&db)?;
    conn.execute("UPDATE evaluations SET sample_answer = ?1 WHERE id = ?2", params![text, evaluation_id])
        .map_err(e)?;
    Ok(())
}

/// Teacher's own band for this attempt — the ground truth for the agreement study.
#[tauri::command]
pub fn set_teacher_score(db: State<'_, Db>, evaluation_id: i64, score: Option<f64>) -> R<()> {
    if let Some(s) = score {
        if !(1.0..=6.0).contains(&s) {
            return Err("교사 점수는 1.0–6.0 사이여야 합니다.".into());
        }
    }
    let conn = lock(&db)?;
    conn.execute("UPDATE evaluations SET teacher_score = ?1 WHERE id = ?2", params![score, evaluation_id])
        .map_err(e)?;
    Ok(())
}

pub fn save_review(conn: &Connection, attempt_id: i64, review: Option<&str>) -> R<()> {
    let n = conn
        .execute("UPDATE attempts SET teacher_review = ?1 WHERE id = ?2", params![review, attempt_id])
        .map_err(e)?;
    if n == 0 {
        return Err(format!("응시 기록을 찾을 수 없습니다 (#{attempt_id})"));
    }
    Ok(())
}

#[tauri::command]
pub fn set_teacher_review(db: State<'_, Db>, attempt_id: i64, review: Option<String>) -> R<()> {
    save_review(&*lock(&db)?, attempt_id, review.as_deref())
}

#[tauri::command]
pub fn get_attempt(db: State<'_, Db>, id: i64) -> R<AttemptDetail> {
    attempt(&*lock(&db)?, id)
}

#[tauri::command]
pub fn list_attempts(db: State<'_, Db>, student_id: Option<i64>, limit: Option<i64>) -> R<Vec<AttemptSummary>> {
    attempts(&*lock(&db)?, student_id, limit.unwrap_or(200))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn fresh() -> Connection {
        let mut conn = Connection::open_in_memory().unwrap();
        crate::db::migrate_for_test(&mut conn);
        conn.execute_batch("PRAGMA foreign_keys = ON;").unwrap();
        conn.execute(
            "INSERT INTO tasks (id, section, task_type, title, prompt, response_seconds) \
             VALUES (1, 'writing', 'academic_discussion', 'Online courses', 'Q?', 600)",
            [],
        )
        .unwrap();
        conn
    }

    #[test]
    fn attempt_roundtrip_with_latest_evaluation() {
        let conn = fresh();
        let sid = add_student(&conn, "  곽태훈 ").unwrap();
        assert_eq!(students(&conn).unwrap()[0].name, "곽태훈");
        assert!(add_student(&conn, "   ").is_err());

        let aid = add_attempt(
            &conn,
            &NewAttempt { task_id: 1, student_id: Some(sid), response_text: "My essay".into(), audio_path: None, duration_seconds: Some(512.0) },
        )
        .unwrap();
        // Unscored attempt: listed, no band yet.
        assert_eq!(attempts(&conn, None, 10).unwrap()[0].band, None);
        assert!(attempt(&conn, aid).unwrap().evaluation.is_none());

        for band in [3.0, 3.5] {
            add_evaluation(
                &conn,
                &NewEvaluation { attempt_id: aid, model_id: "m".into(), rubric_json: "{}".into(), total_score: Some(band), feedback: None, latency_ms: Some(1) },
            )
            .unwrap();
        }
        let d = attempt(&conn, aid).unwrap();
        assert_eq!(d.student_name.as_deref(), Some("곽태훈"));
        assert_eq!(d.task_type, "academic_discussion");
        assert_eq!(d.evaluation.unwrap().total_score, Some(3.5), "latest evaluation wins");
        assert_eq!(attempts(&conn, Some(sid), 10).unwrap()[0].band, Some(3.5));
        assert!(attempts(&conn, Some(sid + 99), 10).unwrap().is_empty());
        assert!(attempt(&conn, 999).is_err());
        assert_eq!(attempts(&conn, None, 10).unwrap()[0].criterion_scores, None, "an empty object has no criteria");

        // Teacher review: saved on the attempt, cleared with None, unknown attempt → error.
        assert_eq!(attempt(&conn, aid).unwrap().teacher_review, None);
        save_review(&conn, aid, Some(r#"{"annotations":[]}"#)).unwrap();
        assert_eq!(attempt(&conn, aid).unwrap().teacher_review.as_deref(), Some(r#"{"annotations":[]}"#));
        save_review(&conn, aid, None).unwrap();
        assert_eq!(attempt(&conn, aid).unwrap().teacher_review, None);
        assert!(save_review(&conn, 999, Some("{}")).is_err());
    }

    #[test]
    fn criterion_scores_from_stored_json() {
        let j = r#"{"criteria":[{"key":"task","score":2},{"key":"tone","score":4},{"key":"language","score":2}],"band":3}"#;
        assert_eq!(criterion_scores(Some(j.into())), Some(vec![2.0, 4.0, 2.0]));
        assert_eq!(criterion_scores(Some("not json".into())), None);
        assert_eq!(criterion_scores(None), None);
    }
}
