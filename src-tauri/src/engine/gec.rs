//! Grammatical error correction with a GECToR tagger (RoBERTa-base, ONNX) — a model
//! trained on learner English, far better at learners' grammar errors than a general LLM
//! or a rule-based checker (reported CoNLL-2014 F0.5 ≈ 0.52 vs LanguageTool ≈ 0.17).
//!
//! GECToR does not rewrite text. For every word it predicts an edit TAG: `$KEEP`,
//! `$DELETE`, `$APPEND_the`, `$REPLACE_on`, `$TRANSFORM_VERB_VB_VBZ`,
//! `$TRANSFORM_AGREEMENT_PLURAL`, … The tags say exactly what kind of error it is, which
//! maps straight onto the app's error taxonomy (src/lib/grammarGuide.ts).
//!
//! Port of gotutiyan/gector (MIT) `predict.py`:
//!   words = ["$START"] + tokens → RoBERTa sub-words (prefix space, special tokens unless the
//!   model is an "official" one) → per-sub-word label logits + error-detection logits → take
//!   the FIRST sub-word of each word → `$KEEP` bias + min-error-probability thresholds →
//!   apply tags → repeat until nothing changes (max N rounds).
//!
//! Everything except `Gec::run_model` is pure and unit-tested; the ONNX Runtime library is
//! loaded at runtime from `<resources>/engines/onnxruntime/` (feature `load-dynamic`).

use crate::{models, paths};
use serde::Serialize;
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::{Mutex, OnceLock};
use std::time::Instant;
use tauri::{AppHandle, Manager};

// ----------------------------------------------------------------- tokenizing

/// A word of the original text with its byte offsets.
#[derive(Debug, Clone, PartialEq)]
pub struct Word {
    pub text: String,
    pub start: usize,
    pub end: usize,
}

const CONTRACTIONS: [&str; 7] = ["n't", "'s", "'re", "'ve", "'ll", "'m", "'d"];

/// spaCy-like tokenization (what GECToR was trained on): punctuation split off, and
/// contractions split ("don't" → "do" "n't"). Offsets point into `text`.
pub fn tokenize_words(text: &str) -> Vec<Word> {
    let mut out = Vec::new();
    let mut i = 0;
    while i < text.len() {
        // skip whitespace
        let c = text[i..].chars().next().unwrap();
        if c.is_whitespace() {
            i += c.len_utf8();
            continue;
        }
        // a whitespace-delimited chunk
        let start = i;
        let mut end = i;
        while end < text.len() {
            let ch = text[end..].chars().next().unwrap();
            if ch.is_whitespace() {
                break;
            }
            end += ch.len_utf8();
        }
        split_chunk(text, start, end, &mut out);
        i = end;
    }
    out
}

fn is_punct(c: char) -> bool {
    matches!(c, '.' | ',' | '!' | '?' | ';' | ':' | '"' | '(' | ')' | '[' | ']' | '“' | '”' | '‘' | '…')
        || c == '\''
}

fn split_chunk(text: &str, mut s: usize, mut e: usize, out: &mut Vec<Word>) {
    let push = |out: &mut Vec<Word>, a: usize, b: usize| {
        if b > a {
            out.push(Word { text: text[a..b].to_string(), start: a, end: b });
        }
    };
    // leading punctuation, one char at a time
    let mut lead = Vec::new();
    while s < e {
        let c = text[s..].chars().next().unwrap();
        if is_punct(c) && c != '\'' {
            lead.push((s, s + c.len_utf8()));
            s += c.len_utf8();
        } else {
            break;
        }
    }
    // trailing punctuation (collected in reverse)
    let mut trail = Vec::new();
    while e > s {
        let c = text[..e].chars().next_back().unwrap();
        if is_punct(c) && !(c == '\'' && text[s..e].len() > 1 && text[s..e].ends_with("s'")) {
            trail.push((e - c.len_utf8(), e));
            e -= c.len_utf8();
        } else {
            break;
        }
    }
    for (a, b) in lead {
        push(out, a, b);
    }
    // contraction suffix ("don't" → "do" + "n't", "it's" → "it" + "'s")
    let core = &text[s..e];
    let lower = core.to_lowercase().replace('’', "'");
    let mut split_at = None;
    for suf in CONTRACTIONS {
        if lower.len() > suf.len() && lower.ends_with(suf) {
            split_at = Some(e - suf.len());
            break;
        }
    }
    match split_at {
        Some(m) if text.is_char_boundary(m) => {
            push(out, s, m);
            push(out, m, e);
        }
        _ => push(out, s, e),
    }
    for (a, b) in trail.into_iter().rev() {
        push(out, a, b);
    }
}

/// Split into sentences (ranges of word indices) at `.`, `!`, `?` tokens.
pub fn sentence_ranges(words: &[Word]) -> Vec<(usize, usize)> {
    let mut out = Vec::new();
    let mut start = 0;
    for (i, w) in words.iter().enumerate() {
        if matches!(w.text.as_str(), "." | "!" | "?") {
            out.push((start, i + 1));
            start = i + 1;
        }
    }
    if start < words.len() {
        out.push((start, words.len()));
    }
    out
}

/// Join corrected tokens back into normal text ("do n't" → "don't", "word ," → "word,").
pub fn detokenize(tokens: &[String]) -> String {
    let mut s = String::new();
    for t in tokens {
        let no_space_before = matches!(t.as_str(), "." | "," | "!" | "?" | ";" | ":" | ")" | "]" | "”" | "…")
            || CONTRACTIONS.iter().any(|c| t.eq_ignore_ascii_case(c));
        let prev_open = s.ends_with('(') || s.ends_with('[') || s.ends_with('“');
        if !s.is_empty() && !no_space_before && !prev_open {
            s.push(' ');
        }
        s.push_str(t);
    }
    s
}

// ------------------------------------------------------------- applying tags

/// verb-form-vocab.txt: lines "go_went:VB_VBD" → decode["go_VB_VBD"] = "went" (first wins).
pub fn load_verb_decode(contents: &str) -> HashMap<String, String> {
    let mut decode = HashMap::new();
    for line in contents.lines() {
        let Some((words, tags)) = line.split_once(':') else { continue };
        let Some((w1, w2)) = words.split_once('_') else { continue };
        let Some((t1, t2)) = tags.trim().split_once('_') else { continue };
        decode.entry(format!("{w1}_{t1}_{t2}")).or_insert_with(|| w2.to_string());
    }
    decode
}

/// A working token: current text + which original word it came from (None = inserted).
#[derive(Debug, Clone)]
pub struct Tok {
    pub text: String,
    pub origin: Option<usize>,
}

/// Apply one round of word-level labels (labels[0] belongs to `$START`).
/// Records, per original word, the labels that touched it.
pub fn apply_labels(
    toks: &[Tok],
    labels: &[String],
    decode: &HashMap<String, String>,
    touched: &mut HashMap<usize, Vec<String>>,
) -> Vec<Tok> {
    // The original word an edit "belongs" to: the token itself, else the nearest previous
    // original word, else (for $START) the first original word.
    let anchor = |i: usize| -> Option<usize> {
        (0..=i).rev().find_map(|k| toks[k].origin).or_else(|| toks.iter().find_map(|t| t.origin))
    };
    let unchanged = |l: &str| matches!(l, "$KEEP" | "<OOV>" | "<PAD>");
    let mut out: Vec<Tok> = Vec::with_capacity(toks.len() + 4);
    let mut i = 0;
    while i < toks.len() {
        let t = &toks[i];
        let label = labels.get(i).map(String::as_str).unwrap_or("$KEEP");
        let is_start = i == 0 && t.text == "$START";
        // Guard (not in the reference): a word already rewritten in an earlier round is not
        // rewritten again. Seen 2026-11-06: "It start" → "starts" (round 1) → "started"
        // (round 2), which then pulled "can" → "could"; the explanation kept round 1's label.
        let rewrite = |l: &str| l.starts_with("$REPLACE_") || l.starts_with("$TRANSFORM_");
        let label = if rewrite(label)
            && t.origin.and_then(|o| touched.get(&o)).map_or(false, |ls| ls.iter().any(|l| rewrite(l)))
        {
            "$KEEP"
        } else {
            label
        };
        if !unchanged(label) {
            if let Some(a) = anchor(i) {
                touched.entry(a).or_default().push(label.to_string());
            }
        }
        if let Some(word) = label.strip_prefix("$APPEND_") {
            out.push(t.clone());
            // Guard (not in the reference): over several rounds a model can re-predict the
            // same insertion ("pay a a a"). Never insert a word that is already next.
            let already = toks.get(i + 1).map_or(false, |n| n.text.eq_ignore_ascii_case(word));
            if !already {
                out.push(Tok { text: word.to_string(), origin: None });
            }
        } else if is_start || unchanged(label) {
            out.push(t.clone());
        } else if label == "$DELETE" {
            // dropped
        } else if let Some(word) = label.strip_prefix("$REPLACE_") {
            out.push(Tok { text: word.to_string(), origin: t.origin });
        } else if label.starts_with("$TRANSFORM_") {
            let text = transform(&t.text, label, decode).unwrap_or_else(|| t.text.clone());
            out.push(Tok { text, origin: t.origin });
        } else if label.starts_with("$MERGE_") && i + 1 < toks.len() {
            // "every" "one" → "everyone"; "well" "known" → "well-known". The next token is
            // consumed; mark its original word as touched so both form one edit.
            let sep = if label == "$MERGE_HYPHEN" { "-" } else { "" };
            if let Some(o) = toks[i + 1].origin {
                touched.entry(o).or_default().push(label.to_string());
            }
            out.push(Tok { text: format!("{}{}{}", t.text, sep, toks[i + 1].text), origin: t.origin });
            i += 2;
            continue;
        } else {
            out.push(t.clone());
        }
        i += 1;
    }
    out
}

fn transform(token: &str, label: &str, decode: &HashMap<String, String>) -> Option<String> {
    Some(match label {
        "$TRANSFORM_CASE_LOWER" => token.to_lowercase(),
        "$TRANSFORM_CASE_UPPER" => token.to_uppercase(),
        "$TRANSFORM_CASE_CAPITAL" => {
            let mut c = token.chars();
            match c.next() {
                Some(f) => f.to_uppercase().collect::<String>() + &c.as_str().to_lowercase(),
                None => String::new(),
            }
        }
        "$TRANSFORM_CASE_CAPITAL_1" => {
            let mut c = token.chars();
            match (c.next(), c.next()) {
                (Some(a), Some(b)) => format!("{a}{}{}", b.to_uppercase(), c.as_str().to_lowercase()),
                _ => token.to_string(),
            }
        }
        "$TRANSFORM_AGREEMENT_PLURAL" => format!("{token}s"),
        "$TRANSFORM_AGREEMENT_SINGULAR" => token.strip_suffix('s').unwrap_or(token).to_string(),
        "$TRANSFORM_SPLIT_HYPHEN" => token.replace('-', " "),
        _ => {
            let tags = label.strip_prefix("$TRANSFORM_VERB_")?;
            decode.get(&format!("{token}_{tags}"))?.clone()
        }
    })
}

/// One correction, in original-text coordinates.
#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct GecEdit {
    pub start: usize,
    pub end: usize,
    pub original: String,
    pub corrected: String,
    /// GECToR tags that produced this edit (e.g. "$TRANSFORM_VERB_VB_VBZ").
    pub labels: Vec<String>,
}

/// Compare final tokens with the original words and emit contiguous edits.
pub fn extract_edits(text: &str, words: &[Word], final_toks: &[Tok], touched: &HashMap<usize, Vec<String>>) -> Vec<GecEdit> {
    // Group final tokens by original word; inserted tokens join the previous group
    // (tokens inserted before any original word join the first word's group).
    let mut groups: Vec<Vec<String>> = vec![Vec::new(); words.len()];
    let mut prefix: Vec<String> = Vec::new();
    let mut last: Option<usize> = None;
    for t in final_toks.iter().filter(|t| t.text != "$START") {
        match (t.origin, last) {
            (Some(o), _) if o < words.len() => {
                groups[o].push(t.text.clone());
                last = Some(o);
            }
            (None, Some(l)) => groups[l].push(t.text.clone()),
            _ => prefix.push(t.text.clone()),
        }
    }
    if !prefix.is_empty() && !words.is_empty() {
        let mut g = prefix;
        g.extend(groups[0].drain(..));
        groups[0] = g;
    }
    let changed: Vec<bool> = words
        .iter()
        .enumerate()
        .map(|(i, w)| groups[i].len() != 1 || groups[i][0] != w.text)
        .collect();

    let mut edits = Vec::new();
    let mut i = 0;
    while i < words.len() {
        if !changed[i] {
            i += 1;
            continue;
        }
        // One edit per changed word, so each gets its own category and explanation
        // ("go to" → "went to the" = verb form + article, two edits). Words are joined only
        // when a $MERGE_ tag consumed the next word ("every one" → "everyone").
        let a = i;
        i += 1;
        while i < words.len()
            && changed[i]
            && touched.get(&i).map_or(false, |ls| ls.iter().any(|l| l.starts_with("$MERGE_")))
        {
            i += 1;
        }
        let b = i - 1;
        let corrected_tokens: Vec<String> = (a..=b).flat_map(|k| groups[k].clone()).collect();
        let mut labels: Vec<String> = (a..=b).flat_map(|k| touched.get(&k).cloned().unwrap_or_default()).collect();
        labels.dedup();
        edits.push(GecEdit {
            start: words[a].start,
            end: words[b].end,
            original: text[words[a].start..words[b].end].to_string(),
            corrected: detokenize(&corrected_tokens),
            labels,
        });
    }
    edits
}

// ------------------------------------------------------------ postprocessing

/// Reference `GECToR.predict` for one sentence: softmax, $KEEP bias, thresholds, argmax.
/// `labels` is [n_subwords × n_labels], `detect` is [n_subwords × n_d]; `first_subword`
/// lists, for each word, the sub-word index of its first piece.
pub fn choose_labels(
    labels: &[f32],
    detect: &[f32],
    n_labels: usize,
    n_d: usize,
    first_subword: &[usize],
    keep_id: usize,
    incorrect_id: usize,
    keep_confidence: f32,
    min_error_prob: f32,
) -> Vec<usize> {
    let softmax = |row: &[f32]| -> Vec<f32> {
        let m = row.iter().cloned().fold(f32::NEG_INFINITY, f32::max);
        let e: Vec<f32> = row.iter().map(|x| (x - m).exp()).collect();
        let s: f32 = e.iter().sum();
        e.into_iter().map(|x| x / s).collect()
    };
    let mut max_err = 0f32;
    let mut picks = Vec::with_capacity(first_subword.len());
    for &j in first_subword {
        let mut p = softmax(&labels[j * n_labels..(j + 1) * n_labels]);
        p[keep_id] += keep_confidence;
        let (best, best_p) = p.iter().enumerate().fold((0, f32::MIN), |acc, (k, &v)| if v > acc.1 { (k, v) } else { acc });
        let d = softmax(&detect[j * n_d..(j + 1) * n_d]);
        max_err = max_err.max(d[incorrect_id]);
        picks.push(if best_p < min_error_prob { keep_id } else { best });
    }
    if max_err < min_error_prob {
        return vec![keep_id; first_subword.len()];
    }
    picks
}

// ---------------------------------------------------------------- the model

pub struct Gec {
    model_id: String,
    session: ort::session::Session,
    tokenizer: tokenizers::Tokenizer,
    id2label: Vec<String>,
    keep_id: usize,
    add_special_tokens: bool,
    max_len: usize,
    decode: HashMap<String, String>,
    input_ids_name: String,
    attention_name: String,
}

#[derive(Default)]
pub struct GecState(pub Mutex<Option<Gec>>);

/// One ONNX Runtime environment per process (ort allows only one); every session borrows it.
static ORT_ENV: OnceLock<Result<ort::environment::Environment, String>> = OnceLock::new();

fn ort_lib(app: &AppHandle) -> Result<PathBuf, String> {
    let name = if cfg!(windows) {
        "onnxruntime.dll"
    } else if cfg!(target_os = "macos") {
        "libonnxruntime.dylib"
    } else {
        "libonnxruntime.so"
    };
    Ok(paths::engines_dir(app)?.join("onnxruntime").join(name))
}

fn ort_env(app: &AppHandle) -> Result<&'static ort::environment::Environment, String> {
    ort_env_at(&ort_lib(app)?)
}

fn ort_env_at(lib: &std::path::Path) -> Result<&'static ort::environment::Environment, String> {
    ORT_ENV
        .get_or_init(|| {
            if !lib.is_file() {
                return Err(format!("ONNX Runtime이 없습니다: {} — `npm run fetch-engines`를 실행하세요.", lib.display()));
            }
            ort::init_from(lib)
                .map_err(|e| format!("ONNX Runtime 로드 실패: {e}"))?
                .with_name("efl-sprite")
                .build()
                .map_err(|e| format!("ONNX Runtime 초기화 실패: {e}"))
        })
        .as_ref()
        .map_err(|e| e.clone())
}

impl Gec {
    pub fn load(app: &AppHandle, model_id: &str) -> Result<Gec, String> {
        let env = ort_env(app)?;
        let dir = models::installed_path(app, model_id)?;
        Gec::from_dir(env, &dir, model_id)
    }

    pub fn from_dir(env: &ort::environment::Environment, dir: &std::path::Path, model_id: &str) -> Result<Gec, String> {
        let read = |name: &str| std::fs::read_to_string(dir.join(name)).map_err(|e| format!("{name}: {e}"));

        let config: serde_json::Value = serde_json::from_str(&read("config.json")?).map_err(|e| format!("config.json: {e}"))?;
        let id2label_map = config["id2label"].as_object().ok_or("config.json has no id2label")?;
        let mut id2label = vec![String::new(); id2label_map.len()];
        for (k, v) in id2label_map {
            let i: usize = k.parse().map_err(|_| format!("bad label id {k}"))?;
            if i < id2label.len() {
                id2label[i] = v.as_str().unwrap_or("").to_string();
            }
        }
        let keep_id = id2label.iter().position(|l| l == "$KEEP").ok_or("no $KEEP label")?;
        let add_special_tokens = !config["is_official_model"].as_bool().unwrap_or(false);
        let max_len = config["max_length"].as_u64().unwrap_or(128) as usize;

        let mut tokenizer = tokenizers::Tokenizer::from_file(dir.join("tokenizer.json")).map_err(|e| format!("tokenizer.json: {e}"))?;
        // Pre-split words need a leading space per word (HF: add_prefix_space=True), exactly
        // like `tokenizer(words, is_split_into_words=True)` in the reference.
        let tok_cfg: serde_json::Value = read("tokenizer_config.json").ok().and_then(|s| serde_json::from_str(&s).ok()).unwrap_or_default();
        if tok_cfg["add_prefix_space"].as_bool().unwrap_or(true) {
            tokenizer.with_pre_tokenizer(Some(tokenizers::pre_tokenizers::byte_level::ByteLevel::new(true, true, true)));
        }
        tokenizer.with_truncation(None).map_err(|e| e.to_string())?;
        tokenizer.with_padding(None);

        let decode = load_verb_decode(&read("verb-form-vocab.txt")?);

        let session = ort::session::Session::builder(env)
            .map_err(|e| e.to_string())?
            .with_intra_threads(crate::engine::threads())
            .map_err(|e| e.to_string())?
            .commit_from_file(dir.join("model.onnx"))
            .map_err(|e| format!("model.onnx 로드 실패: {e}"))?;
        let names: Vec<String> = session.inputs().iter().map(|i| i.name().to_string()).collect();
        let pick = |want: &str| names.iter().find(|n| n.contains(want)).cloned();
        let input_ids_name = pick("input_ids").ok_or(format!("model inputs {names:?} have no input_ids"))?;
        let attention_name = pick("attention").ok_or(format!("model inputs {names:?} have no attention_mask"))?;

        Ok(Gec {
            model_id: model_id.to_string(),
            session,
            tokenizer,
            id2label,
            keep_id,
            add_special_tokens,
            max_len,
            decode,
            input_ids_name,
            attention_name,
        })
    }

    /// One forward pass for one sentence (words incl. "$START"). Returns word-level labels.
    fn run_model(&mut self, words: &[String], keep_conf: f32, min_err: f32) -> Result<Vec<String>, String> {
        let enc = self
            .tokenizer
            .encode(tokenizers::InputSequence::PreTokenized(words.iter().map(|s| s.as_str().into()).collect()), self.add_special_tokens)
            .map_err(|e| e.to_string())?;
        let mut ids: Vec<i64> = enc.get_ids().iter().map(|&x| x as i64).collect();
        let mut word_ids = enc.get_word_ids().to_vec();
        if ids.len() > self.max_len {
            ids.truncate(self.max_len);
            word_ids.truncate(self.max_len);
        }
        let n = ids.len();
        let mask = vec![1i64; n];
        // first sub-word of each word
        let mut first = Vec::new();
        let mut prev: Option<u32> = None;
        for (j, w) in word_ids.iter().enumerate() {
            if let Some(w) = w {
                if prev != Some(*w) {
                    first.push(j);
                }
                prev = Some(*w);
            }
        }
        let ids_t = ort::value::Tensor::from_array((vec![1i64, n as i64], ids)).map_err(|e| e.to_string())?;
        let mask_t = ort::value::Tensor::from_array((vec![1i64, n as i64], mask)).map_err(|e| e.to_string())?;
        let outputs = self
            .session
            .run(ort::inputs![self.input_ids_name.as_str() => ids_t, self.attention_name.as_str() => mask_t])
            .map_err(|e| format!("GEC 추론 실패: {e}"))?;
        // Identify outputs by their last dimension. Tag logits = the widest float output
        // (it can differ from config's id2label count by special labels such as <PAD>, so
        // do not require an exact match); detection logits = a float output of width 2–4.
        let mut lab: Option<(Vec<f32>, usize)> = None;
        let mut det: Option<(Vec<f32>, usize)> = None;
        let mut seen = Vec::new();
        for (name, v) in outputs.iter() {
            match v.try_extract_tensor::<f32>() {
                Ok((shape, data)) => {
                    let last = *shape.last().unwrap_or(&0) as usize;
                    seen.push(format!("{name}: f32 {:?}", &shape[..]));
                    if data.len() != n * last.max(1) {
                        continue; // not [1, n, k]
                    }
                    if last > 4 && lab.as_ref().map_or(true, |(_, w)| last > *w) {
                        lab = Some((data.to_vec(), last));
                    } else if (2..=4).contains(&last) {
                        det = Some((data.to_vec(), last));
                    }
                }
                Err(_) => seen.push(format!("{name}: {:?} (not f32)", v.dtype())),
            }
        }
        let (lab, n_labels) = lab.ok_or_else(|| {
            format!(
                "label logits output not found (sequence length {n}, {} labels in config). Model outputs: {}",
                self.id2label.len(),
                seen.join("; ")
            )
        })?;
        // No detector head → no sentence-level threshold (incorrect prob = 1).
        let (det, n_d) = det.unwrap_or_else(|| ([0.0f32, 1.0, 0.0].repeat(n), 3));
        // Labels beyond config's id2label (e.g. <PAD>) map to $KEEP below.
        let keep_id = self.keep_id.min(n_labels - 1);
        let picked = choose_labels(&lab, &det, n_labels, n_d, &first, keep_id, 1, keep_conf, min_err);
        Ok(picked.into_iter().map(|i| self.id2label.get(i).cloned().unwrap_or_else(|| "$KEEP".into())).collect())
    }

    /// Correct a whole response. Sentences are processed independently.
    pub fn check(&mut self, text: &str, opts: &GecOptions) -> Result<Vec<GecEdit>, String> {
        let words = tokenize_words(text);
        let mut edits = Vec::new();
        for (a, b) in sentence_ranges(&words) {
            let sent: Vec<Word> = words[a..b].to_vec();
            let mut toks: Vec<Tok> = std::iter::once(Tok { text: "$START".into(), origin: None })
                .chain(sent.iter().enumerate().map(|(i, w)| Tok { text: w.text.clone(), origin: Some(i) }))
                .collect();
            let mut touched: HashMap<usize, Vec<String>> = HashMap::new();
            for _ in 0..opts.iterations {
                let input: Vec<String> = toks.iter().map(|t| t.text.clone()).collect();
                let labels = self.run_model(&input, opts.keep_confidence, opts.min_error_prob)?;
                if labels.iter().all(|l| matches!(l.as_str(), "$KEEP" | "<OOV>" | "<PAD>")) {
                    break;
                }
                toks = apply_labels(&toks, &labels, &self.decode, &mut touched);
            }
            edits.extend(extract_edits(text, &sent, &toks, &touched));
        }
        Ok(edits)
    }
}

#[derive(Debug, Clone, serde::Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct GecOptions {
    /// Added to $KEEP's probability: higher = fewer, more certain corrections.
    pub keep_confidence: f32,
    /// Sentences/tokens below this error probability are left alone.
    pub min_error_prob: f32,
    pub iterations: usize,
}
impl Default for GecOptions {
    fn default() -> Self {
        // Precision-leaning defaults: wrong "corrections" confuse learners more than a miss.
        GecOptions { keep_confidence: 0.2, min_error_prob: 0.4, iterations: 3 }
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GecResult {
    pub edits: Vec<GecEdit>,
    pub ms: u64,
}

#[tauri::command]
pub async fn gec_check(
    app: AppHandle,
    model_id: String,
    text: String,
    options: Option<GecOptions>,
) -> Result<GecResult, String> {
    let opts = options.unwrap_or_default();
    // ONNX inference is CPU-heavy and the session is behind a std Mutex: run it on a
    // blocking thread, never on the async runtime.
    tauri::async_runtime::spawn_blocking(move || {
        let t0 = Instant::now();
        let state = app.state::<GecState>();
        let mut guard = state.0.lock().map_err(|e| e.to_string())?;
        if guard.as_ref().map(|g| g.model_id != model_id).unwrap_or(true) {
            *guard = Some(Gec::load(&app, &model_id)?);
        }
        let edits = guard.as_mut().unwrap().check(&text, &opts)?;
        Ok(GecResult { edits: to_utf16_offsets(&text, edits), ms: t0.elapsed().as_millis() as u64 })
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Rust offsets are UTF-8 bytes; the UI (JavaScript strings) indexes UTF-16 code units.
/// Without this, every highlight after a curly quote (3 bytes, 1 unit) would be shifted.
pub fn to_utf16_offsets(text: &str, edits: Vec<GecEdit>) -> Vec<GecEdit> {
    let conv = |byte: usize| text[..byte].encode_utf16().count();
    edits.into_iter().map(|e| GecEdit { start: conv(e.start), end: conv(e.end), ..e }).collect()
}

/// Is the ONNX runtime library bundled for this platform?
pub fn runtime_present(app: &AppHandle) -> bool {
    ort_lib(app).map(|p| p.is_file()).unwrap_or(false)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn texts(ws: &[Word]) -> Vec<&str> {
        ws.iter().map(|w| w.text.as_str()).collect()
    }

    #[test]
    fn tokenizes_like_spacy_with_offsets() {
        let t = "I don't think so, but it's \"fine\" (really).";
        let ws = tokenize_words(t);
        assert_eq!(texts(&ws), ["I", "do", "n't", "think", "so", ",", "but", "it", "'s", "\"", "fine", "\"", "(", "really", ")", "."]);
        for w in &ws {
            assert_eq!(&t[w.start..w.end], w.text);
        }
        assert_eq!(sentence_ranges(&ws), vec![(0, ws.len())]);
        assert_eq!(detokenize(&texts(&ws).iter().map(|s| s.to_string()).collect::<Vec<_>>()), "I don't think so, but it's \" fine \" (really).");
    }

    #[test]
    fn korean_and_curly_quotes_do_not_panic() {
        let t = "He said “hi” — 안녕. It’s ok.";
        let ws = tokenize_words(t);
        for w in &ws {
            assert_eq!(&t[w.start..w.end], w.text);
        }
        assert_eq!(sentence_ranges(&ws).len(), 2);
    }

    fn run(text: &str, labels: &[&str], decode: &HashMap<String, String>) -> (Vec<GecEdit>, String) {
        let words = tokenize_words(text);
        let toks: Vec<Tok> = std::iter::once(Tok { text: "$START".into(), origin: None })
            .chain(words.iter().enumerate().map(|(i, w)| Tok { text: w.text.clone(), origin: Some(i) }))
            .collect();
        let labels: Vec<String> = labels.iter().map(|s| s.to_string()).collect();
        let mut touched = HashMap::new();
        let out = apply_labels(&toks, &labels, decode, &mut touched);
        let sentence = detokenize(&out.iter().filter(|t| t.text != "$START").map(|t| t.text.clone()).collect::<Vec<_>>());
        (extract_edits(text, &words, &out, &touched), sentence)
    }

    #[test]
    fn a_word_is_not_rewritten_twice_across_rounds() {
        let decode = load_verb_decode("start_starts:VB_VBZ\nstarts_started:VBZ_VBD\n");
        let sent = ["It", "start", "early", "."];
        let mut toks: Vec<Tok> = std::iter::once(Tok { text: "$START".into(), origin: None })
            .chain(sent.iter().enumerate().map(|(i, w)| Tok { text: w.to_string(), origin: Some(i) }))
            .collect();
        let mut touched = HashMap::new();
        let l = |v: &[&str]| v.iter().map(|s| s.to_string()).collect::<Vec<_>>();
        toks = apply_labels(&toks, &l(&["$KEEP", "$KEEP", "$TRANSFORM_VERB_VB_VBZ", "$KEEP", "$KEEP"]), &decode, &mut touched);
        toks = apply_labels(&toks, &l(&["$KEEP", "$KEEP", "$TRANSFORM_VERB_VBZ_VBD", "$APPEND_very", "$KEEP"]), &decode, &mut touched);
        let out: Vec<&str> = toks.iter().map(|t| t.text.as_str()).collect();
        // second rewrite of "start" refused; other edits in the same round still apply
        assert_eq!(out, ["$START", "It", "starts", "early", "very", "."]);
        assert_eq!(touched[&1], ["$TRANSFORM_VERB_VB_VBZ"]);
    }

    #[test]
    fn applies_tags_and_extracts_edits_in_original_coordinates() {
        let decode = load_verb_decode("start_starts:VB_VBZ\nstart_started:VB_VBD\n");
        //            $START  It      start                    very    early   .
        let (edits, s) = run("It start very early.", &["$KEEP", "$KEEP", "$TRANSFORM_VERB_VB_VBZ", "$KEEP", "$KEEP", "$KEEP"], &decode);
        assert_eq!(s, "It starts very early.");
        assert_eq!(edits.len(), 1);
        assert_eq!((edits[0].original.as_str(), edits[0].corrected.as_str()), ("start", "starts"));
        assert_eq!(&"It start very early."[edits[0].start..edits[0].end], "start");
        assert_eq!(edits[0].labels, ["$TRANSFORM_VERB_VB_VBZ"]);

        // article insertion + preposition replacement + deletion
        //                      $START  we      pay           fee     in      morning   the       .
        let (edits, s) = run("we pay fee in morning the.", &["$KEEP", "$KEEP", "$APPEND_a", "$KEEP", "$APPEND_the", "$KEEP", "$DELETE", "$KEEP"], &decode);
        assert_eq!(s, "we pay a fee in the morning.");
        let pairs: Vec<(&str, &str)> = edits.iter().map(|e| (e.original.as_str(), e.corrected.as_str())).collect();
        assert_eq!(pairs, [("pay", "pay a"), ("in", "in the"), ("the", "")]);
        assert_eq!(edits[0].labels, ["$APPEND_a"]);

        // adjacent errors stay separate edits
        let decode2 = load_verb_decode("go_went:VB_VBD\n");
        //                      $START  I       go                        to            library   .
        let (edits, s) = run("I go to library.", &["$KEEP", "$KEEP", "$TRANSFORM_VERB_VB_VBD", "$APPEND_the", "$KEEP", "$KEEP"], &decode2);
        assert_eq!(s, "I went to the library.");
        let pairs: Vec<(&str, &str)> = edits.iter().map(|e| (e.original.as_str(), e.corrected.as_str())).collect();
        assert_eq!(pairs, [("go", "went"), ("to", "to the")]);

        // insertion at the very start ($START + APPEND) and noun number
        //                      $START          students  is              .
        let (edits, s) = run("students is.", &["$APPEND_The", "$KEEP", "$REPLACE_are", "$KEEP"], &decode);
        assert_eq!(s, "The students are.");
        let pairs: Vec<(&str, &str)> = edits.iter().map(|e| (e.original.as_str(), e.corrected.as_str())).collect();
        assert_eq!(pairs, [("students", "The students"), ("is", "are")]);
    }

    #[test]
    fn offsets_are_converted_to_utf16() {
        let decode = load_verb_decode("start_starts:VB_VBZ\n");
        let text = "It’s “late”. It start.";
        let words = tokenize_words(text);
        let (a, b) = sentence_ranges(&words)[1];
        let sent = words[a..b].to_vec();
        let toks: Vec<Tok> = std::iter::once(Tok { text: "$START".into(), origin: None })
            .chain(sent.iter().enumerate().map(|(i, w)| Tok { text: w.text.clone(), origin: Some(i) }))
            .collect();
        let labels: Vec<String> = ["$KEEP", "$KEEP", "$TRANSFORM_VERB_VB_VBZ", "$KEEP"].iter().map(|s| s.to_string()).collect();
        let mut touched = HashMap::new();
        let out = apply_labels(&toks, &labels, &decode, &mut touched);
        let edits = to_utf16_offsets(text, extract_edits(text, &sent, &out, &touched));
        let units: Vec<u16> = text.encode_utf16().collect();
        let shown = String::from_utf16(&units[edits[0].start..edits[0].end]).unwrap();
        assert_eq!(shown, "start");
    }

    #[test]
    fn unknown_verb_form_leaves_token_unchanged() {
        let (edits, s) = run("He go.", &["$KEEP", "$KEEP", "$TRANSFORM_VERB_VB_VBZ", "$KEEP"], &HashMap::new());
        assert_eq!(s, "He go.");
        assert!(edits.is_empty());
    }

    /// End-to-end through ONNX Runtime with a synthetic GECToR-shaped model.
    /// Run with: EFL_ORT_LIB=/path/libonnxruntime.so EFL_GEC_DIR=/path/fakegec cargo test -- --ignored
    #[test]
    #[ignore]
    fn onnx_end_to_end_with_synthetic_model() {
        let (Ok(lib), Ok(dir)) = (std::env::var("EFL_ORT_LIB"), std::env::var("EFL_GEC_DIR")) else {
            eprintln!("EFL_ORT_LIB / EFL_GEC_DIR not set — skipped");
            return;
        };
        let env = ort_env_at(std::path::Path::new(&lib)).expect("ort env");
        let mut gec = Gec::from_dir(env, std::path::Path::new(&dir), "fake").expect("load");
        let text = "It start very early. we pay fee.";
        let opts = GecOptions { keep_confidence: 0.0, min_error_prob: 0.0, iterations: 3 };
        let edits = gec.check(text, &opts).expect("check");
        let pairs: Vec<(&str, &str)> = edits.iter().map(|e| (e.original.as_str(), e.corrected.as_str())).collect();
        assert_eq!(pairs, [("start", "starts"), ("pay", "pay a")]);
        for e in &edits {
            assert_eq!(&text[e.start..e.end], e.original);
        }
        assert_eq!(edits[0].labels, ["$TRANSFORM_VERB_VB_VBZ"]);
        // Precision knob: a huge $KEEP bias suppresses every edit.
        let strict = GecOptions { keep_confidence: 5.0, min_error_prob: 0.0, iterations: 3 };
        assert!(gec.check(text, &strict).unwrap().is_empty());
    }

    #[test]
    fn thresholds_match_reference() {
        // 2 words, 3 labels ($OOV, $KEEP, $DELETE), detector [correct, incorrect, pad]
        let labels = [0.0, 0.0, 5.0, /* w2 */ 0.0, 5.0, 0.0];
        let det_err = [0.0, 5.0, 0.0, 0.0, 5.0, 0.0];
        let det_ok = [5.0, 0.0, 0.0, 5.0, 0.0, 0.0];
        assert_eq!(choose_labels(&labels, &det_err, 3, 3, &[0, 1], 1, 1, 0.0, 0.0), vec![2, 1]);
        // sentence-level: max error prob below threshold → all KEEP
        assert_eq!(choose_labels(&labels, &det_ok, 3, 3, &[0, 1], 1, 1, 0.0, 0.5), vec![1, 1]);
        // $KEEP bias large enough → KEEP wins
        assert_eq!(choose_labels(&labels, &det_err, 3, 3, &[0, 1], 1, 1, 1.0, 0.0), vec![1, 1]);
    }
}
